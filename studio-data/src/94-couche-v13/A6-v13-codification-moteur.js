        // ======================= V13 : CODIFICATION — LE MOTEUR =======================
        // Rattacher à chaque ligne d'une liste reçue le code d'un référentiel.
        //
        // Le cas : on reçoit une liste d'équipements — un libellé écrit à la main, une famille, quelques
        // attributs. À côté, une nomenclature en arbre : la famille en haut, des systèmes, des sous-systèmes,
        // et tout en bas le type d'équipement avec son code. Ce code est structurant ; sans lui la liste ne se
        // rattache à rien. Personne ne peut le poser à la main sur des milliers de lignes, et aucune égalité
        // stricte ne le trouve, parce que le même équipement s'écrit de dix façons.
        //
        // On empile donc des règles, de la plus sûre à la plus souple, et la première qui répond gagne :
        //   1. le code est déjà renseigné dans la liste — on le garde ;
        //   2. la table de correspondance — « ce libellé-là, c'est ce code », alimentée par les décisions ;
        //   3. les règles de mots-clés et d'expressions — « contient POMPE et CENTRIFUGE mais pas À VIDE » ;
        //   4. la ressemblance — le libellé comparé à ceux de la nomenclature, avec deux seuils.
        // Et par-dessus tout : ne chercher que dans la bonne branche de l'arbre quand la famille est connue.
        //
        // Ce fichier ne fabrique que du SQL et des phrases ; l'écran est dans A7-v13-codification-ecran.js.

        /** Les trois façons de mesurer la ressemblance de deux libellés. */
        const V13_METHODES_DE_RESSEMBLANCE = {
            mots: 'Mots retrouvés (recommandé)',
            jw: 'Jaro-Winkler (compare les chaînes)',
            lev: 'Levenshtein (caractères à changer)'
        };
        /** Les deux formes d'une règle écrite à la main. */
        const V13_TYPES_DE_REGLE = { motscles: 'Mots-clés', expression: 'Expression régulière' };
        /** Un mot compte pour retrouvé à une faute près, mais seulement à partir de quatre lettres. */
        const V13_LETTRES_POUR_TOLERER_UNE_FAUTE = 4;
        const V13_TOLERANCE_PAR_MOT = 0.9;
        /** Combien de propositions on montre à la revue : au-delà, on ne choisit plus, on hésite. */
        const V13_CANDIDATS_MONTRES = 3;
        /**
         * La table où le résultat de la codification est déposé avant d’être relu. Sans elle, chaque lecture
         * — les lignes, les comptes, les cas à revoir — recoderait la liste entière.
         */
        const V13_TABLE_CODEE = 'v13_codee';

        /** La liste des codifications, rangée dans l'état de l'application comme les recettes et les liens. */
        function v13Codifications() {
            return (state.codifications = state.codifications || []);
        }
        function v13CodificationParIdentifiant(identifiant) {
            return v13Codifications().find(codification => codification.id === identifiant);
        }

        /**
         * Un mot réduit à ce qui compte pour comparer : majuscules, sans accents, la ponctuation et les espaces
         * multiples ramenés à un seul. « Pompe centrifuge (x2) » et « POMPE  CENTRIFUGE X2 » deviennent
         * identiques, ce qui est bien le sens que leur donne un humain.
         */
        function v13MotCompare(mot) {
            return String(mot || '')
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, ' ')
                .trim();
        }
        /** La même réduction, mais en SQL, sur une colonne. */
        function v13TexteCompare(expression) {
            return `TRIM(regexp_replace(strip_accents(UPPER(CAST(${expression} AS VARCHAR))), '[^A-Z0-9]+', ' ', 'g'))`;
        }
        /** Une valeur vide, quelle que soit la façon dont elle est vide. */
        function v13EstVide(expression) {
            return `(${expression} IS NULL OR TRIM(CAST(${expression} AS VARCHAR)) = '')`;
        }

        /** Les synonymes utilisables : un mot retenu, et au moins une variante qui n'est pas vide. */
        function v13SynonymesUtiles(codification) {
            return ((codification || {}).synonymes || [])
                .map(synonyme => ({
                    retenu: v13MotCompare(synonyme.motRetenu),
                    proche: !!synonyme.proche,
                    variantes: (synonyme.variantes || []).map(v13MotCompare).filter(Boolean)
                }))
                .filter(synonyme => synonyme.retenu && synonyme.variantes.length);
        }
        /** Un mot écrit est-il cette variante-là : tel quel, ou à une faute près quand on l'a autorisé. */
        function v13ConditionDeLaVariante(variante, proche) {
            const egal = `motEcrit = ${sqlLiteral(variante)}`;
            if (!proche || variante.length < V13_LETTRES_POUR_TOLERER_UNE_FAUTE) return egal;
            return `(${egal} OR jaro_winkler_similarity(motEcrit, ${sqlLiteral(variante)}) >= ${V13_TOLERANCE_PAR_MOT})`;
        }
        /**
         * Le texte où chaque variante déclarée a laissé place au mot retenu. On le fait des deux côtés avant de
         * comparer : « MOTOPOMPE CENTRIF » et « Pompe centrifuge » deviennent tous deux « POMPE CENTRIFUGE ».
         * Deux passes, parce qu'une variante en plusieurs mots ne se remplace pas mot à mot.
         */
        function v13Canoniser(expression, codification) {
            const synonymes = v13SynonymesUtiles(codification);
            if (!synonymes.length) return expression;
            let texte = `' ' || ${expression} || ' '`;
            synonymes.forEach(synonyme =>
                synonyme.variantes
                    .filter(variante => variante.includes(' '))
                    .forEach(variante => {
                        texte = `replace(${texte}, ${sqlLiteral(' ' + variante + ' ')}, ${sqlLiteral(' ' + synonyme.retenu + ' ')})`;
                    })
            );
            const cas = synonymes
                .map(synonyme => {
                    const simples = synonyme.variantes.filter(variante => !variante.includes(' '));
                    if (!simples.length) return '';
                    const reconnait = simples.map(variante => v13ConditionDeLaVariante(variante, synonyme.proche)).join(' OR ');
                    return `WHEN ${reconnait} THEN ${sqlLiteral(synonyme.retenu)}`;
                })
                .filter(Boolean);
            const nettoye = `TRIM(${texte})`;
            if (!cas.length) return nettoye;
            return `array_to_string(list_transform(string_split(${nettoye}, ' '), motEcrit -> CASE ${cas.join(' ')} ELSE motEcrit END), ' ')`;
        }
        /** Le même travail, sur un texte que l'on tient déjà : c'est ainsi qu'un libellé appris est rangé. */
        function v13MotRetenuDuTexte(texte, codification) {
            const synonymes = v13SynonymesUtiles(codification);
            let mots = v13MotCompare(texte);
            synonymes.forEach(synonyme =>
                synonyme.variantes
                    .filter(variante => variante.includes(' '))
                    .forEach(variante => {
                        mots = ` ${mots} `.split(` ${variante} `).join(` ${synonyme.retenu} `).trim();
                    })
            );
            const retenuDuMot = {};
            synonymes.forEach(synonyme =>
                synonyme.variantes
                    .filter(variante => !variante.includes(' '))
                    .forEach(variante => {
                        retenuDuMot[variante] = synonyme.retenu;
                    })
            );
            return mots
                .split(' ')
                .map(mot => retenuDuMot[mot] || mot)
                .join(' ')
                .trim();
        }

        /** La condition SQL d'une règle : vraie quand la règle reconnaît la ligne. */
        function v13ConditionDeLaRegle(regle, colonneParDefaut) {
            const colonne = regle.colonne || colonneParDefaut;
            if (!colonne) throw new Error(`La règle « ${regle.code} » ne dit pas quelle colonne examiner.`);
            const texte = v13TexteCompare(`s.${sqlIdent(colonne)}`);
            const contient = mot => `${texte} LIKE ${sqlLiteral('%' + v13MotCompare(mot) + '%')}`;
            if (regle.type === 'expression') {
                if (!String(regle.motif || '').trim()) throw new Error(`La règle « ${regle.code} » n'a pas d'expression.`);
                return `regexp_matches(${texte}, ${sqlLiteral(String(regle.motif).trim())})`;
            }
            const voulus = (regle.contient || []).filter(Boolean);
            if (!voulus.length) throw new Error(`La règle « ${regle.code} » n'a aucun mot-clé à chercher.`);
            const trouves = voulus.map(contient).join(regle.ou ? ' OR ' : ' AND ');
            const exclus = (regle.sauf || [])
                .filter(Boolean)
                .map(mot => `NOT ${contient(mot)}`)
                .join(' AND ');
            return exclus ? `((${trouves}) AND ${exclus})` : `(${trouves})`;
        }

        /**
         * La part des mots de la référence que l'on retrouve dans le texte lu. Les deux côtés arrivent DÉJÀ
         * découpés en listes de mots : c'est ce qui permet de ne découper qu'une fois par ligne, et non une
         * fois par couple examiné.
         */
        function v13MotsRetrouves(motsLus, motsDeReference) {
            const retrouve = `len(list_filter(${motsLus},
                motLu -> motLu = motRef OR (length(motRef) >= ${V13_LETTRES_POUR_TOLERER_UNE_FAUTE}
                    AND jaro_winkler_similarity(motLu, motRef) >= ${V13_TOLERANCE_PAR_MOT}))) > 0`;
            return `list_aggregate(list_transform(${motsDeReference}, motRef -> CASE WHEN ${retrouve} THEN 1 ELSE 0 END), 'sum')::DOUBLE
                / GREATEST(len(${motsDeReference}), 1)`;
        }
        /** La ressemblance de deux textes, selon la méthode choisie ; 1 = identiques, 0 = rien à voir. */
        function v13Ressemblance(gauche, droite, methode) {
            const vide = `${gauche} IS NULL OR ${droite} IS NULL OR ${gauche} = '' OR ${droite} = ''`;
            if (methode === 'lev')
                return `CASE WHEN ${vide} THEN 0.0
                    ELSE 1.0 - levenshtein(${gauche}, ${droite})::DOUBLE / GREATEST(length(${gauche}), length(${droite}), 1) END`;
            if (methode === 'jw') return `CASE WHEN ${vide} THEN 0.0 ELSE jaro_winkler_similarity(${gauche}, ${droite}) END`;
            return `CASE WHEN ${vide} THEN 0.0 ELSE ${v13MotsRetrouves(`string_split(${gauche}, ' ')`, `string_split(${droite}, ' ')`)} END`;
        }
        /**
         * Les comparaisons réellement appliquées. Quand on n'a rien déclaré, c'est le libellé de la liste
         * contre le libellé de la nomenclature : le cas courant n'oblige à rien dire.
         */
        function v13ComparaisonsRetenues(codification) {
            const declarees = (codification.comparaisons || []).filter(
                comparaison => comparaison.colonneSource && comparaison.colonneNomenclature
            );
            if (declarees.length) return declarees;
            return [
                {
                    id: 'defaut',
                    colonneSource: codification.colonneLibelle,
                    colonneNomenclature: codification.colonneLibelleRef,
                    poids: 1,
                    methode: ''
                }
            ];
        }
        /**
         * Le nom des colonnes préparées d'une comparaison : d'un côté le texte ramené aux mots retenus, de
         * l'autre ce même texte déjà découpé en mots. Un nom par côté — liste ou type — et par comparaison.
         */
        function v13NomDuTextePret(cote, rang) {
            return `__texte_${cote}_${rang}`;
        }
        function v13NomDesMotsPrets(cote, rang) {
            return `__mots_${cote}_${rang}`;
        }
        /**
         * Un côté préparé : chaque colonne comparée ramenée aux mots retenus, puis découpée en mots.
         *
         * C'est LE point qui décide de tout. Sans cette préparation, la mise en majuscules, le retrait des
         * accents, le remplacement des variantes et le découpage en mots étaient refaits POUR CHAQUE COUPLE
         * examiné — des millions de fois au lieu d'une fois par ligne. C'est ce qui épuisait la mémoire du
         * navigateur.
         *
         * « depuis » nomme la table lue et son alias ; « identite » la colonne qui désigne la ligne ;
         * « enPlus » ce qu'il faut emporter au passage, comme le code du type ou la branche de l'arbre.
         */
        function v13CotePrepare(codification, cote, colonneDe, depuis, identite, enPlus) {
            const comparaisons = v13ComparaisonsRetenues(codification);
            const textes = comparaisons.map(
                (comparaison, rang) =>
                    `${v13Canoniser(v13TexteCompare(colonneDe(comparaison)), codification)} AS ${v13NomDuTextePret(cote, rang)}`
            );
            const mots = comparaisons.map(
                (comparaison, rang) =>
                    `string_split(pretes.${v13NomDuTextePret(cote, rang)}, ' ') AS ${v13NomDesMotsPrets(cote, rang)}`
            );
            const colonnes = [identite].concat(textes, enPlus || []).join(',\n                ');
            return `SELECT pretes.*, ${mots.join(', ')}
            FROM (SELECT ${colonnes}
            FROM ${depuis}) pretes`;
        }
        /** La liste à coder, préparée. « depuis » vaut « reconnues r » à la codification, « aCoder r » à la revue. */
        function v13ListePreparee(codification, depuis) {
            const enPlus = codification.restreindreSource
                ? [
                      `${v13TexteCompare(`r.${sqlIdent(codification.restreindreSource)}`)} AS __branche_liste`,
                      `${v13EstVide(`r.${sqlIdent(codification.restreindreSource)}`)} AS __branche_inconnue`
                  ]
                : ['NULL AS __branche_liste', 'TRUE AS __branche_inconnue'];
            return v13CotePrepare(
                codification,
                'liste',
                comparaison => `r.${sqlIdent(comparaison.colonneSource)}`,
                depuis,
                'r.__rn AS __rn',
                enPlus
            );
        }
        /** La nomenclature, préparée : elle emporte aussi le code, le libellé et le chemin de chaque type. */
        function v13TypesPrepares(codification, tableNomenclature) {
            const niveaux = (codification.niveaux || []).filter(Boolean);
            const chemin = niveaux.length
                ? `concat_ws(' › ', ${niveaux.map(niveau => `CAST(n.${sqlIdent(niveau)} AS VARCHAR)`).join(', ')})`
                : `CAST(n.${sqlIdent(codification.colonneCode)} AS VARCHAR)`;
            const enPlus = [
                `n.${sqlIdent(codification.colonneCode)} AS __code_type`,
                `CAST(n.${sqlIdent(codification.colonneLibelleRef)} AS VARCHAR) AS __libelle_type`,
                `${chemin} AS __chemin_type`,
                codification.restreindreNomenclature
                    ? `${v13TexteCompare(`n.${sqlIdent(codification.restreindreNomenclature)}`)} AS __branche_type`
                    : 'NULL AS __branche_type'
            ];
            return v13CotePrepare(
                codification,
                'type',
                comparaison => `n.${sqlIdent(comparaison.colonneNomenclature)}`,
                `${tableNomenclature} n`,
                'n.rowid AS __ligne',
                enPlus
            );
        }
        /** La ressemblance d'une comparaison, sur deux lignes déjà préparées. */
        function v13RessemblancePrete(rang, methode) {
            const texteLu = `liste.${v13NomDuTextePret('liste', rang)}`;
            const texteRef = `types.${v13NomDuTextePret('type', rang)}`;
            if (methode !== 'mots' && methode) return v13Ressemblance(texteLu, texteRef, methode);
            const vide = `${texteLu} IS NULL OR ${texteRef} IS NULL OR ${texteLu} = '' OR ${texteRef} = ''`;
            const mesure = v13MotsRetrouves(
                `liste.${v13NomDesMotsPrets('liste', rang)}`,
                `types.${v13NomDesMotsPrets('type', rang)}`
            );
            return `CASE WHEN ${vide} THEN 0.0 ELSE ${mesure} END`;
        }
        /**
         * Le score d'une ligne préparée contre un type préparé : la moyenne pondérée des comparaisons
         * déclarées. Les alias « liste » et « types » sont ceux que posent les requêtes de ce fichier.
         */
        function v13ScoreDeRessemblance(codification) {
            const comparaisons = v13ComparaisonsRetenues(codification);
            const total = comparaisons.reduce((somme, comparaison) => somme + (Number(comparaison.poids) || 1), 0) || 1;
            const parts = comparaisons.map(
                (comparaison, rang) =>
                    `${Number(comparaison.poids) || 1} * (${v13RessemblancePrete(rang, comparaison.methode || codification.methode)})`
            );
            return `(${parts.join(' + ')}) / ${total}`;
        }

        /** La condition qui enferme la recherche dans la bonne branche — vraie partout si l'on ne restreint pas. */
        function v13ConditionDeBranche(codification) {
            if (!codification.restreindreSource || !codification.restreindreNomenclature) return 'TRUE';
            // Une ligne sans famille connue n'est pas exclue : on la cherche dans tout l'arbre.
            return '(liste.__branche_liste = types.__branche_type OR liste.__branche_inconnue)';
        }

        /**
         * Un mot réduit à sa tête, pour rapprocher deux écritures voisines. Six lettres, pas quatre : à quatre,
         * des mots sans rapport se confondent — « VANNE » avec « VANNAGE », « MOTEUR » avec « MOTOPOMPE » — et
         * le rapprochement ramène alors des centaines de types là où quelques-uns suffiraient.
         */
        const V13_TETE_DE_MOT = 6;
        /**
         * Combien de types, au plus, on accepte d’examiner pour une ligne. C’est ce plafond qui rend le coût
         * proportionnel au nombre de lignes, et non au produit des deux tables : sans lui, une liste dont les
         * mots sont tous répandus fait revenir presque toute la nomenclature à chaque ligne, et la mémoire du
         * navigateur y passe. Les mots les plus rares sont servis les premiers : ce sont donc les meilleurs
         * candidats qui entrent dans le quota.
         */
        const V13_TYPES_EXAMINES = 200;
        /** Un mot qui désigne plus que cette part de la nomenclature ne distingue rien : il ne sert pas à choisir. */
        const V13_PART_MOT_TROP_COURANT = 0.05;
        /** Sur une petite nomenclature, un mot présent dans une vingtaine de types reste utilisable. */
        const V13_TYPES_TOLERES_PAR_MOT = 20;

        /** Les mots d’un côté préparé, réduits à leur tête : c’est par eux que l’on rapproche. */
        function v13TetesDeMots(codification, cote, table, identite) {
            return v13ComparaisonsRetenues(codification)
                .map(
                    (comparaison, rang) => `SELECT mots.${identite}, substr(mots.mot, 1, ${V13_TETE_DE_MOT}) AS tete
        FROM (SELECT ${identite}, unnest(${v13NomDesMotsPrets(cote, rang)}) AS mot FROM ${table}) mots
        WHERE mots.mot <> ''`
                )
                .join('\n        UNION ALL\n        ');
        }
        /**
         * Les couples qu’il vaut la peine de comparer, lus sur les deux côtés déjà préparés.
         *
         * Sans cela, on compare chaque ligne de la liste à CHAQUE ligne de la nomenclature : sur des dizaines de
         * milliers de lignes de part et d’autre, cela fait des milliards de couples, chacun payant un calcul de
         * ressemblance. La requête ne finit pas.
         *
         * On rapproche donc par les mots — mais par les mots qui DISTINGUENT. « POMPE » se trouve dans tous les
         * types de pompes : rapprocher là-dessus revient à ne rien rapprocher du tout. On écarte donc les mots
         * trop courants et l’on garde les rares — un numéro de modèle, un terme propre au type. Une ligne dont
         * tous les mots sont courants garde tout de même le moins courant d’entre eux : mieux vaut peu de
         * candidats que zéro.
         *
         * La réserve : une faute dans les quatre premières lettres d’un mot fait manquer le couple. C’est le
         * prix d’une requête qui se termine.
         */
        function v13SqlDesRapprochables(codification) {
            const lus = v13TetesDeMots(codification, 'liste', 'listePrete', '__rn');
            const types = v13TetesDeMots(codification, 'type', 'typesPrets', '__ligne');
            return `WITH motsLus AS MATERIALIZED (\n        ${lus}\n    ), motsTypes AS MATERIALIZED (\n        ${types}\n    ),
            frequences AS (SELECT tete, COUNT(DISTINCT __ligne) AS types FROM motsTypes GROUP BY tete),
            seuil AS (SELECT GREATEST(${V13_TYPES_TOLERES_PAR_MOT}, CAST(${V13_PART_MOT_TROP_COURANT} * COUNT(DISTINCT __ligne) AS BIGINT)) AS maximum FROM motsTypes),
            pesees AS (
        SELECT DISTINCT lus.__rn AS __rn, lus.tete AS tete, frequences.types AS types
        FROM motsLus lus JOIN frequences ON frequences.tete = lus.tete
            ),
            classees AS (
        SELECT __rn, tete, types,
            row_number() OVER (PARTITION BY __rn ORDER BY types, tete) AS rang,
            SUM(types) OVER (PARTITION BY __rn ORDER BY types, tete ROWS UNBOUNDED PRECEDING) AS portee
        FROM pesees
            ),
            tetesRetenues AS (
        SELECT classees.__rn, classees.tete FROM classees, seuil
        WHERE classees.rang = 1
            OR (classees.types <= seuil.maximum AND classees.portee <= ${V13_TYPES_EXAMINES})
            )
            SELECT DISTINCT tetesRetenues.__rn, motsTypes.__ligne
            FROM tetesRetenues JOIN motsTypes ON motsTypes.tete = tetesRetenues.tete`;
        }

        /** Vérifie qu'une codification dit tout ce qu'il faut pour être exécutée, et le dit en français sinon. */
        function v13VerifierLaCodification(codification) {
            const manques = [
                [codification.source, 'la liste à coder'],
                [codification.colonneLibelle, 'la colonne du libellé'],
                [codification.nomenclature, 'la nomenclature de référence'],
                [codification.colonneCode, 'la colonne du code dans la nomenclature'],
                [codification.colonneLibelleRef, 'la colonne du libellé dans la nomenclature']
            ];
            const absent = manques.find(manque => !manque[0]);
            if (absent) throw new Error(`Codification incomplète : choisissez ${absent[1]}.`);
            if (Number(codification.seuilRevoir) > Number(codification.seuilAuto))
                throw new Error('Le seuil « à revoir » ne peut pas dépasser le seuil « d’office ».');
            [codification.source, codification.nomenclature].forEach(nom => {
                if (!tableByName(nom)) throw new Error(`La source « ${nom} » n'est pas chargée.`);
            });
        }

        /** La table de correspondance, portée dans la requête : un libellé retenu, un code. */
        function v13TableDesCorrespondances(codification) {
            const lignes = (codification.correspondances || [])
                .map(correspondance => ({
                    libelle: v13MotRetenuDuTexte(correspondance.libelle, codification),
                    code: correspondance.code
                }))
                .filter(correspondance => correspondance.libelle && correspondance.code);
            // Un libellé appris deux fois ne doit pas faire ressortir la ligne deux fois : la dernière
            // décision prise sur ce libellé l’emporte, et elle est seule dans la table.
            const codeParLibelle = new Map();
            lignes.forEach(ligne => codeParLibelle.set(ligne.libelle, ligne.code));
            if (!codeParLibelle.size) return '';
            const valeurs = [...codeParLibelle].map(paire => `(${sqlLiteral(paire[0])}, ${sqlLiteral(paire[1])})`).join(', ');
            return `(VALUES ${valeurs}) AS corr(libelle, code)`;
        }
        /** Le code retenu, règle après règle, la première qui répond l'emportant. */
        function v13CodeDesRegles(codification, correspondances) {
            const cas = [];
            if (codification.colonneCodeExistant) {
                const colonne = `s.${sqlIdent(codification.colonneCodeExistant)}`;
                cas.push(`WHEN NOT ${v13EstVide(colonne)} THEN CAST(${colonne} AS VARCHAR)`);
            }
            if (correspondances) cas.push('WHEN corr.code IS NOT NULL THEN corr.code');
            (codification.regles || [])
                .filter(regle => regle.actif)
                .forEach(regle =>
                    cas.push(`WHEN ${v13ConditionDeLaRegle(regle, codification.colonneLibelle)} THEN ${sqlLiteral(regle.code)}`)
                );
            return cas.length ? `CASE ${cas.join(' ')} ELSE NULL END` : 'NULL';
        }
        /** D'où vient le code, dans le même ordre : c'est ce qui rend la codification justifiable. */
        function v13OrigineDesRegles(codification, correspondances) {
            const cas = [];
            if (codification.colonneCodeExistant)
                cas.push(`WHEN NOT ${v13EstVide(`s.${sqlIdent(codification.colonneCodeExistant)}`)} THEN 'existant'`);
            if (correspondances) cas.push(`WHEN corr.code IS NOT NULL THEN 'correspondance'`);
            (codification.regles || [])
                .filter(regle => regle.actif)
                .forEach(regle =>
                    cas.push(
                        `WHEN ${v13ConditionDeLaRegle(regle, codification.colonneLibelle)} THEN ${sqlLiteral('regle:' + regle.id)}`
                    )
                );
            return cas.length ? `CASE ${cas.join(' ')} ELSE NULL END` : 'NULL';
        }
        /** Le code final, son origine, son score, son statut, et le chemin déplié dans l'arbre. */
        function v13SelectFinal(codification) {
            const code = `COALESCE(reconnues.__code_regle,
                CASE WHEN candidats.__score_voisin >= ${Number(codification.seuilAuto)} THEN candidats.__code_voisin END)`;
            const statut = `CASE WHEN ${code} IS NOT NULL THEN 'office'
                WHEN candidats.__code_voisin IS NOT NULL THEN 'revoir' ELSE 'absent' END`;
            /*
             * Le chemin de l’arbre est lu sur UNE seule ligne par code.
             *
             * Un même code de type revient presque toujours à plusieurs endroits de l’arborescence : le même
             * type de pompe sous le transfert, sous l’alimentation, sous le secours. En joignant la
             * nomenclature entière sur le code, chaque ligne codée ressortait autant de fois qu’il y avait
             * de lignes portant ce code — 450 000 lignes en entrée en rendaient 1 437 576. On dédoublonne
             * donc par code avant de joindre : le décompte de sortie égale celui d’entrée, toujours.
             */
            const cleDuCode = v13TexteCompare('typesPrets.__code_type');
            const arbre = `(SELECT __code_type, __chemin_type FROM typesPrets
                QUALIFY row_number() OVER (PARTITION BY ${cleDuCode} ORDER BY __ligne) = 1) arbre`;
            return `SELECT reconnues.* EXCLUDE (__libelle, __code_regle, __origine_regle),
            ${code} AS __code,
            COALESCE(reconnues.__origine_regle, CASE WHEN ${code} IS NOT NULL THEN 'ressemblance' ELSE 'aucune' END) AS __origine,
            ROUND(COALESCE(candidats.__score_voisin, CASE WHEN reconnues.__code_regle IS NOT NULL THEN 1.0 ELSE 0.0 END), 3) AS __score,
            ${statut} AS __statut,
            arbre.__chemin_type AS __chemin
        FROM reconnues
        LEFT JOIN candidats ON candidats.__rn = reconnues.__rn
        LEFT JOIN ${arbre} ON ${v13TexteCompare('arbre.__code_type')} = ${v13TexteCompare(code)}`;
        }

        /**
         * Le SQL qui code chaque ligne de la liste. Trois temps : « reconnues » applique la pile de règles,
         * « candidats » cherche le meilleur voisin dans la nomenclature pour celles qui restent, et le SELECT
         * final tranche entre les deux et déplie le chemin de l'arbre.
         */
        function v13SqlDeCodification(codification) {
            v13VerifierLaCodification(codification);
            const tableSource = sqlIdent(duckTableName(tableByName(codification.source).id));
            const tableNomenclature = sqlIdent(duckTableName(tableByName(codification.nomenclature).id));
            const libelle = v13Canoniser(v13TexteCompare(`s.${sqlIdent(codification.colonneLibelle)}`), codification);
            const correspondances = v13TableDesCorrespondances(codification);
            const jointureCorrespondances = correspondances
                ? `\n  LEFT JOIN ${correspondances} ON corr.libelle = ${libelle}`
                : '';
            const reconnues = `SELECT s.*, ${libelle} AS __libelle,
        ${v13CodeDesRegles(codification, correspondances)} AS __code_regle,
        ${v13OrigineDesRegles(codification, correspondances)} AS __origine_regle
            FROM ${tableSource} s${jointureCorrespondances}`;
            // Le score n’est calculé qu’UNE fois par couple retenu.
            const notes = `SELECT liste.__rn AS __rn, types.__code_type AS __code_voisin,
                (${v13ScoreDeRessemblance(codification)}) AS __score_voisin
            FROM rapprochables p
            JOIN listePrete liste ON liste.__rn = p.__rn
            JOIN typesPrets types ON types.__ligne = p.__ligne
            WHERE ${v13ConditionDeBranche(codification)}`;
            // « arg_max » garde le meilleur voisin de chaque ligne en un seul regroupement. Une fenêtre aurait
            // d’abord retenu TOUS les couples pour les trier : c’est là que la mémoire du navigateur s’épuisait.
            const candidats = `SELECT __rn, arg_max(__code_voisin, __score_voisin) AS __code_voisin,
                max(__score_voisin) AS __score_voisin
            FROM (\n${notes}\n        ) notes
            GROUP BY __rn HAVING max(__score_voisin) >= ${Number(codification.seuilRevoir)}`;
            const decisions = v13SqlDesDecisions(codification);
            const codee = `WITH reconnues AS (\n${reconnues}\n), listePrete AS MATERIALIZED (\n${v13ListePreparee(codification, 'reconnues r WHERE r.__code_regle IS NULL')}\n), typesPrets AS MATERIALIZED (\n${v13TypesPrepares(codification, tableNomenclature)}\n), rapprochables AS (\n    ${v13SqlDesRapprochables(codification)}\n), candidats AS (\n${candidats}\n)\n${v13SelectFinal(codification)}`;
            return decisions ? `SELECT codee.* REPLACE (${decisions}) FROM (\n${codee}\n) codee` : codee;
        }

        /** Les lignes tranchées à la main l'emportent sur tout le reste : c'est un humain qui a regardé. */
        function v13SqlDesDecisions(codification) {
            const decisions = Object.keys(codification.decisions || {})
                .map(rang => ({ rang: Number(rang) || 0, code: String(codification.decisions[rang] || '') }))
                .filter(decision => decision.code);
            if (!decisions.length) return '';
            const cas = decisions
                .map(decision => `WHEN codee.__rn = ${decision.rang} THEN ${sqlLiteral(decision.code)}`)
                .join(' ');
            const tranchee = `CASE ${cas} ELSE NULL END`;
            return `COALESCE(${tranchee}, codee.__code) AS __code,
        CASE WHEN ${tranchee} IS NOT NULL THEN 'decision' ELSE codee.__origine END AS __origine,
        CASE WHEN ${tranchee} IS NOT NULL THEN 'office' ELSE codee.__statut END AS __statut`;
        }

        /**
         * Le SQL des cas à revoir : pour chaque ligne qu'aucune règle n'a reconnue, les meilleurs voisins de la
         * nomenclature, avec leur score et leur chemin. C'est de quoi trancher en un coup d'œil.
         */
        function v13SqlDesCasARevoir(codification, combien, tableCodee) {
            v13VerifierLaCodification(codification);
            const tableNomenclature = sqlIdent(duckTableName(tableByName(codification.nomenclature).id));
            // La table codée est déjà calculée : on ne recode pas la liste pour la relire. Seules les
            // quelques lignes à revoir sont préparées, puis rapprochées comme à la codification.
            return `WITH aCoder AS (
            SELECT codee.*, CAST(codee.${sqlIdent(codification.colonneLibelle)} AS VARCHAR) AS __texte
            FROM ${sqlIdent(tableCodee || V13_TABLE_CODEE)} codee
            WHERE __statut = 'revoir' ORDER BY __rn LIMIT ${Number(combien) || 50}
        ), listePrete AS MATERIALIZED (\n${v13ListePreparee(codification, 'aCoder r')}\n
        ), typesPrets AS MATERIALIZED (\n${v13TypesPrepares(codification, tableNomenclature)}\n
        ), rapprochables AS (\n    ${v13SqlDesRapprochables(codification)}\n
        ), notes AS (
            SELECT liste.__rn AS rang, aCoder.__texte AS libelle, CAST(types.__code_type AS VARCHAR) AS code,
                types.__libelle_type AS libelleRef, types.__chemin_type AS chemin,
                ROUND((${v13ScoreDeRessemblance(codification)}), 3) AS score
            FROM rapprochables p
            JOIN listePrete liste ON liste.__rn = p.__rn
            JOIN aCoder ON aCoder.__rn = liste.__rn
            JOIN typesPrets types ON types.__ligne = p.__ligne
            WHERE ${v13ConditionDeBranche(codification)}
        )
        SELECT * FROM notes WHERE score > 0
        QUALIFY row_number() OVER (PARTITION BY rang ORDER BY score DESC) <= ${V13_CANDIDATS_MONTRES}
        ORDER BY rang, score DESC`;
        }

        /**
         * Ce qu’il faut dire quand la codification échoue. La plupart des échecs viennent de la mémoire du
         * navigateur : le message brut de DuckDB parle alors de fichiers temporaires, ce qui n’aide personne.
         * On le remplace par ce que l’on peut réellement faire.
         */
        function v13PhraseDeLErreur(erreur) {
            const message = String((erreur && erreur.message) || erreur);
            const memoire =
                /do not support writing|temp_directory|temporary|out of memory|memory limit|cannot allocate|Failed to allocate/i.test(
                    message
                );
            if (!memoire) return message;
            return (
                'la mémoire du navigateur n’a pas suffi, et ce navigateur ne permet pas d’écrire sur le disque. ' +
                'Renseignez « Chercher dans la bonne branche » pour ne comparer que dans la famille de chaque ligne, ' +
                'retirez les comparaisons les moins utiles, ou codez la liste en plusieurs morceaux. Détail : ' +
                message
            );
        }

        /**
         * Le récapitulatif des choix faits, en français, pour qu’on les relise sans déplier les réglages.
         * Une ligne par décision : ce que l’on code, contre quoi, ce que l’on compare, ce que l’on a appris.
         */
        function v13RecapDeLaCodification(codification) {
            const dit = valeur => (String(valeur || '').trim() ? String(valeur).trim() : '— à choisir —');
            const comparaisons = (codification.comparaisons || []).filter(
                comparaison => comparaison.colonneSource && comparaison.colonneNomenclature
            );
            const niveaux = (codification.niveaux || []).filter(Boolean);
            const regles = (codification.regles || []).filter(regle => regle.actif);
            const lignes = [
                { intitule: 'À coder', valeur: `${dit(codification.source)} · colonne ${dit(codification.colonneLibelle)}` },
                {
                    intitule: 'Contre',
                    valeur: `${dit(codification.nomenclature)} · code ${dit(codification.colonneCode)} · libellé ${dit(codification.colonneLibelleRef)}`
                },
                {
                    intitule: 'Comparaison',
                    valeur: comparaisons.length
                        ? comparaisons.map(v13PhraseDeLaComparaison).join(' · ')
                        : `${dit(codification.colonneLibelle)} contre ${dit(codification.colonneLibelleRef)}`
                },
                {
                    intitule: 'Mesure',
                    valeur: `${V13_METHODES_DE_RESSEMBLANCE[codification.methode] || codification.methode} · d’office au-dessus de ${codification.seuilAuto} · à revoir au-dessus de ${codification.seuilRevoir}`
                }
            ];
            if (codification.colonneCodeExistant)
                lignes.push({ intitule: 'Code déjà fourni', valeur: `${codification.colonneCodeExistant}, gardé tel quel` });
            if (codification.restreindreSource && codification.restreindreNomenclature)
                lignes.push({
                    intitule: 'Branche',
                    valeur: `${codification.restreindreSource} doit correspondre à ${codification.restreindreNomenclature}`
                });
            if (niveaux.length) lignes.push({ intitule: 'Chemin de l’arbre', valeur: niveaux.join(' › ') });
            if ((codification.synonymes || []).length)
                lignes.push({
                    intitule: 'Mots qui en valent d’autres',
                    valeur: codification.synonymes.map(v13PhraseDuSynonyme).join(' · ')
                });
            if (regles.length)
                lignes.push({
                    intitule: 'Règles actives',
                    valeur: regles.map(regle => v13PhraseDeLaRegle(regle, codification.colonneLibelle)).join(' · ')
                });
            if ((codification.correspondances || []).length)
                lignes.push({
                    intitule: 'Libellés appris',
                    valeur: `${codification.correspondances.length} libellé(s) tranché(s) à la main`
                });
            return lignes;
        }

        /**
         * Ce qu’il faut dire du décompte : la codification rend exactement autant de lignes qu’elle en a reçu.
         * Si ce n’est pas le cas, c’est un défaut, et il vaut mieux le dire que laisser croire au résultat.
         */
        function v13PhraseDuDecompte(lignesEnEntree, lignesEnSortie) {
            const enFrancais = nombre => Number(nombre || 0).toLocaleString('fr-FR');
            if (!lignesEnEntree) return `${enFrancais(lignesEnSortie)} ligne(s) codée(s).`;
            if (lignesEnEntree === lignesEnSortie)
                return `${enFrancais(lignesEnSortie)} ligne(s) en entrée, autant en sortie : aucune ligne n’a été perdue ni démultipliée.`;
            return `⚠️ ${enFrancais(lignesEnEntree)} ligne(s) en entrée mais ${enFrancais(lignesEnSortie)} en sortie. Signalez-le : une codification doit rendre exactement ce qu’elle a reçu.`;
        }

        /** Le bilan d'une codification, à partir du compte de chaque statut. */
        function v13BilanDeCodification(comptes) {
            const compte = statut => (comptes.find(candidat => candidat.statut === statut) || {}).lignes || 0;
            const office = compte('office');
            const revoir = compte('revoir');
            const absent = compte('absent');
            const total = office + revoir + absent;
            const couverture = total ? Math.round((1000 * office) / total) / 1000 : 0;
            const enFrancais = nombre => Number(nombre).toLocaleString('fr-FR');
            if (!total) return { total, office, revoir, absent, couverture, phrase: 'Aucune ligne à coder.' };
            const reste =
                revoir || absent
                    ? ` — ${enFrancais(revoir)} à revoir, ${enFrancais(absent)} sans proposition.`
                    : ' — rien à revoir.';
            return {
                total,
                office,
                revoir,
                absent,
                couverture,
                phrase: `${enFrancais(office)} ligne(s) codées d’office sur ${enFrancais(total)} (${Math.round(100 * couverture)} %)${reste}`
            };
        }

        /** La correspondance qu'une décision laisse derrière elle ; un code vide l'efface au lieu d'en poser une. */
        function v13CorrespondanceApresDecision(codification, libelle, code) {
            const compare = v13MotRetenuDuTexte(libelle, codification);
            const correspondances = codification.correspondances || [];
            if (!compare) return correspondances;
            const autres = correspondances.filter(
                candidate => v13MotRetenuDuTexte(candidate.libelle, codification) !== compare
            );
            if (!code) return autres;
            return autres.concat([
                { libelle, code, auteur: (v11Prefs || {}).identite || '', le: new Date().toISOString().slice(0, 10) }
            ]);
        }

        /** La règle dite en français, comme on la lirait à voix haute. */
        function v13PhraseDeLaRegle(regle, colonneParDefaut) {
            const colonne = regle.colonne || colonneParDefaut || 'le libellé';
            if (regle.type === 'expression')
                return String(regle.motif || '').trim()
                    ? `si ${colonne} correspond à « ${String(regle.motif).trim()} » → ${regle.code}`
                    : 'règle incomplète : il manque l’expression';
            const voulus = (regle.contient || []).filter(Boolean);
            if (!voulus.length) return 'règle incomplète : il manque les mots à chercher';
            const exclus = (regle.sauf || []).filter(Boolean);
            const sauf = exclus.length ? ` mais pas ${exclus.join(' ni ')}` : '';
            return `si ${colonne} contient ${voulus.join(regle.ou ? ' ou ' : ' et ')}${sauf} → ${regle.code}`;
        }
        /** La comparaison dite en français, pour vérifier qu'on n'a pas croisé les colonnes des deux côtés. */
        function v13PhraseDeLaComparaison(comparaison) {
            if (!comparaison.colonneSource || !comparaison.colonneNomenclature)
                return 'comparaison incomplète : choisissez une colonne de chaque côté';
            const mesure = comparaison.methode
                ? ` (${String(V13_METHODES_DE_RESSEMBLANCE[comparaison.methode] || comparaison.methode).split(' (')[0]})`
                : '';
            const poids = Number(comparaison.poids) && Number(comparaison.poids) !== 1 ? `, poids ${comparaison.poids}` : '';
            return `${comparaison.colonneSource} contre ${comparaison.colonneNomenclature}${poids}${mesure}`;
        }
        /** Le synonyme dit en français, pour vérifier d'un coup d'œil qu'on ne l'a pas écrit à l'envers. */
        function v13PhraseDuSynonyme(synonyme) {
            if (!String(synonyme.motRetenu || '').trim()) return 'synonyme incomplet : il manque le mot retenu';
            const variantes = (synonyme.variantes || []).filter(Boolean);
            if (!variantes.length) return `« ${synonyme.motRetenu} » : aucune variante déclarée`;
            const tolerance = synonyme.proche ? ', même mal orthographiées' : '';
            return `${variantes.join(', ')} ${variantes.length > 1 ? 'valent' : 'vaut'} ${synonyme.motRetenu}${tolerance}`;
        }
        /** D'où vient un code, dit en clair — « regle:r3 » n'apprend rien à personne. */
        function v13PhraseDeLOrigine(origine, regles) {
            if (String(origine).startsWith('regle:')) {
                const regle = (regles || []).find(candidate => candidate.id === String(origine).slice('regle:'.length));
                return regle ? `règle « ${regle.code} »` : 'règle supprimée depuis';
            }
            const phrases = {
                existant: 'code déjà fourni',
                correspondance: 'table de correspondance',
                ressemblance: 'ressemblance du libellé',
                decision: 'décision prise à la revue',
                aucune: 'rien trouvé'
            };
            return phrases[origine] || String(origine);
        }
        /** La prochaine chose à faire, d'après le bilan : un écran qui dit « 47 à revoir » sans dire quoi faire ne sert à rien. */
        function v13ProchaineAction(bilan) {
            if (!bilan || !bilan.total) return 'Choisissez la liste à coder et la nomenclature, puis lancez la codification.';
            if (bilan.revoir)
                return `Passez les ${bilan.revoir} cas à revoir : chaque décision servira aux prochaines livraisons.`;
            if (bilan.absent)
                return `${bilan.absent} ligne(s) sans proposition : ajoutez une règle de mots-clés pour les attraper.`;
            return 'Tout est codé : le résultat peut partir.';
        }
