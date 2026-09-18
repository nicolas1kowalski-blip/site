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
        /**
         * Combien de propositions on montre à la revue, DANS la famille de la ligne. Trois ne suffisaient
         * pas : dès qu’un type d’une autre famille se gliçait dans le lot, il prenait la place d’un
         * candidat légitime. La famille de la ligne est servie la première, et largement.
         */
        const V13_CANDIDATS_MONTRES = 8;
        /**
         * Et combien on en montre EN PLUS, pris ailleurs dans l’arbre. Ils viennent après, jamais à la place :
         * c’est ce qui permet de voir qu’un type existe, mais rangé sous une autre famille.
         */
        const V13_CANDIDATS_ELARGIS = 3;
        /** Ce que l’on montre au plus, quelle que soit la codification : au-delà on n’choisit plus, on hésite. */
        const V13_PROPOSITIONS_MAXIMUM = 20;
        /** Combien de propositions cette codification demande, borné à quelque chose de lisible. */
        function v13CombienDePropositions(codification) {
            // Rien de déclaré : le réglage par défaut. Un nombre saisi : on le respecte, ramené dans le lisible.
            const declare = (codification || {}).propositions;
            const demande = declare === '' || declare === null || declare === undefined ? NaN : Number(declare);
            if (!Number.isFinite(demande)) return V13_CANDIDATS_MONTRES;
            return Math.max(1, Math.min(V13_PROPOSITIONS_MAXIMUM, Math.round(demande)));
        }
        /**
         * La table où le résultat de la codification est déposé avant d’être relu. Sans elle, chaque lecture
         * — les lignes, les comptes, les cas à revoir — recoderait la liste entière.
         */
        const V13_TABLE_CODEE = 'v13_codee';
        /** Où s'assemble, paquet par paquet, la revue complète avant de devenir un jeu. */
        const V13_TABLE_REVUE = 'v13_revue';
        /**
         * Combien de libellés par paquet à l'export. Assez grand pour ne pas multiplier les allers-retours,
         * assez petit pour que le rapprochement d'un paquet tienne dans la mémoire d'un navigateur.
         */
        const V13_CAS_PAR_PAQUET = 5000;

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
        /**
         * Un mot ramené au singulier : on retire le S ou le X final des mots de plus de trois lettres.
         *
         * Sans cela, « POMPES » et « POMPE » sont deux mots étrangers l’un à l’autre : ils ne se rapprochent
         * pas, et ils ne comptent pas comme retrouvés. Mesuré sur un vocabulaire d’équipements français, la
         * moitié des lignes ne trouvaient rien alors qu’elles partageaient un mot avec leur type. Trois
         * lettres au minimum, pour ne pas réduire « VIS » à « VI ».
         */
        const V13_LETTRES_POUR_OTER_LE_PLURIEL = 3;
        function v13AuSingulier(mot) {
            const ecrit = String(mot || '');
            return ecrit.length > V13_LETTRES_POUR_OTER_LE_PLURIEL && /[SX]$/.test(ecrit) ? ecrit.slice(0, -1) : ecrit;
        }
        /** Le même passage au singulier, mot à mot, sur une expression SQL. */
        function v13MotsAuSingulier(expression) {
            const ramene = `CASE WHEN length(mot) > ${V13_LETTRES_POUR_OTER_LE_PLURIEL}
                AND (ends_with(mot, 'S') OR ends_with(mot, 'X')) THEN substr(mot, 1, length(mot) - 1) ELSE mot END`;
            return `array_to_string(list_transform(string_split(${expression}, ' '), mot -> ${ramene}), ' ')`;
        }

        /** Une valeur vide, quelle que soit la façon dont elle est vide. */
        function v13EstVide(expression) {
            return `(${expression} IS NULL OR TRIM(CAST(${expression} AS VARCHAR)) = '')`;
        }

        /** Les synonymes utilisables : un mot retenu, et au moins une variante qui n'est pas vide. */
        function v13SynonymesUtiles(codification) {
            return ((codification || {}).synonymes || [])
                .map(synonyme => ({
                    retenu: v13AuSingulier(v13MotCompare(synonyme.motRetenu)),
                    proche: !!synonyme.proche,
                    variantes: (synonyme.variantes || [])
                        .map(variante => v13AuSingulier(v13MotCompare(variante)))
                        .filter(Boolean)
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
            // Le singulier D'ABORD : les variantes déclarées sont elles aussi rangées au singulier, donc les
            // deux côtés se reconnaissent, « motopompes » comme « motopompe ».
            const auSingulier = v13MotsAuSingulier(expression);
            const synonymes = v13SynonymesUtiles(codification);
            if (!synonymes.length) return auSingulier;
            let texte = `' ' || ${auSingulier} || ' '`;
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
            let mots = v13MotCompare(texte).split(' ').map(v13AuSingulier).join(' ');
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
        function v13TetesDeMots(codification, cote, table, identite, branche) {
            const avecBranche = branche ? `, ${branche}` : '';
            return v13ComparaisonsRetenues(codification)
                .map(
                    (
                        comparaison,
                        rang
                    ) => `SELECT mots.${identite}${avecBranche}, substr(mots.mot, 1, ${V13_TETE_DE_MOT}) AS tete
        FROM (SELECT ${identite}${avecBranche}, unnest(${v13NomDesMotsPrets(cote, rang)}) AS mot FROM ${table}) mots
        WHERE mots.mot <> ''`
                )
                .join('\n        UNION ALL\n        ');
        }
        /**
         * Le choix des têtes de mots d'une ligne : les plus rares d'abord, tant que le nombre de types
         * atteints reste sous le plafond.
         *
         * « parFamille » dit OÙ la rareté se mesure. Dans tout l'arbre, « CHAUDIERE » est un mot répandu :
         * il était écarté, et la ligne n'examinait jamais les chaudières de sa propre famille. Or dans cette
         * famille-là, il n'est peut-être porté que par cinq types — c'est justement lui qui distingue. La
         * rareté se mesure donc aussi famille par famille, et ce choix-là passe en premier.
         */
        function v13ChoixDesTetes(parFamille) {
            const memeFamille = parFamille ? ' AND frequences.branche = lus.__branche_liste' : '';
            const memeSeuil = parFamille ? 'seuil.branche = lus.__branche_liste' : 'TRUE';
            const frequences = parFamille ? 'frequencesDeLaFamille' : 'frequencesPartout';
            const seuil = parFamille ? 'seuilDeLaFamille' : 'seuilPartout';
            const branche = parFamille ? 'classees.branche, ' : '';
            const brancheLue = parFamille ? 'lus.__branche_liste AS branche, ' : '';
            return `SELECT ${branche}classees.__rn, classees.tete FROM (
            SELECT ${parFamille ? 'pesees.branche, ' : ''}pesees.__rn, pesees.tete, pesees.types, pesees.maximum,
                row_number() OVER (PARTITION BY pesees.__rn ORDER BY pesees.types, pesees.tete) AS rang,
                SUM(pesees.types) OVER (PARTITION BY pesees.__rn ORDER BY pesees.types, pesees.tete
                    ROWS UNBOUNDED PRECEDING) AS portee
            FROM (SELECT DISTINCT ${brancheLue}lus.__rn AS __rn, lus.tete AS tete,
                    frequences.types AS types, seuil.maximum AS maximum
                FROM motsLus lus
                JOIN ${frequences} AS frequences ON frequences.tete = lus.tete${memeFamille}
                JOIN ${seuil} AS seuil ON ${memeSeuil}) pesees
        ) classees
        WHERE classees.rang = 1
            OR (classees.types <= classees.maximum AND classees.portee <= ${V13_TYPES_EXAMINES})`;
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
            // La famille n'est connue que si elle est déclarée des deux côtés ; sinon on ne sait pas comparer.
            const parFamille = !!(codification.restreindreSource && codification.restreindreNomenclature);
            const lus = v13TetesDeMots(codification, 'liste', 'listePrete', '__rn', parFamille ? '__branche_liste' : '');
            const types = v13TetesDeMots(codification, 'type', 'typesPrets', '__ligne', parFamille ? '__branche_type' : '');
            const compte = 'COUNT(DISTINCT __ligne)';
            const plafond = `GREATEST(${V13_TYPES_TOLERES_PAR_MOT}, CAST(${V13_PART_MOT_TROP_COURANT} * ${compte} AS BIGINT))`;
            // Les comptes par famille, et le choix des têtes qui va avec : c'est l'étape qui manquait.
            const parFamilleSql = parFamille
                ? `,
            frequencesDeLaFamille AS (
        SELECT __branche_type AS branche, tete, ${compte} AS types FROM motsTypes GROUP BY 1, 2
            ),
            seuilDeLaFamille AS (
        SELECT __branche_type AS branche, ${plafond} AS maximum FROM motsTypes GROUP BY 1
            ),
            tetesDeLaFamille AS (\n        ${v13ChoixDesTetes(true)}\n            )`
                : '';
            // Étape 1 : les types de la famille de la ligne. Étape 2 : le reste de l'arbre. Dans cet ordre,
            // et l'un n'enlève jamais rien à l'autre — c'est l'union des deux qui part au calcul du score.
            const dansLaFamille = parFamille
                ? `
        UNION ALL
        SELECT tetesDeLaFamille.__rn AS __rn, motsTypes.__ligne AS __ligne
        FROM tetesDeLaFamille JOIN motsTypes ON motsTypes.tete = tetesDeLaFamille.tete
            AND motsTypes.__branche_type = tetesDeLaFamille.branche`
                : '';
            return `WITH motsLus AS MATERIALIZED (\n        ${lus}\n    ), motsTypes AS MATERIALIZED (\n        ${types}\n    ),
            frequencesPartout AS (SELECT tete, ${compte} AS types FROM motsTypes GROUP BY tete),
            seuilPartout AS (SELECT ${plafond} AS maximum FROM motsTypes),
            tetesPartout AS (\n        ${v13ChoixDesTetes(false)}\n            )${parFamilleSql}
            SELECT DISTINCT couples.__rn, couples.__ligne FROM (
        SELECT tetesPartout.__rn AS __rn, motsTypes.__ligne AS __ligne
        FROM tetesPartout JOIN motsTypes ON motsTypes.tete = tetesPartout.tete${dansLaFamille}
            ) couples`;
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
            // Le meilleur voisin de la bonne branche, s’il y en a un.
            const meilleur = 'CASE WHEN candidats.__score_dans IS NOT NULL THEN candidats.__codes_voisins[1] END';
            // Deux types différents au même score : la machine ne peut pas choisir. Elle ne choisit donc pas.
            const exaequo = `(candidats.__score_dans IS NOT NULL AND len(candidats.__scores_voisins) > 1
                AND candidats.__scores_voisins[2] = candidats.__scores_voisins[1]
                AND candidats.__codes_voisins[2] IS DISTINCT FROM candidats.__codes_voisins[1])`;
            // Le meilleur voisin trouvé AILLEURS dans l’arbre, quand la branche l’a écarté.
            const hors = 'CASE WHEN candidats.__score_hors IS NOT NULL THEN candidats.__code_hors END';
            const code = `COALESCE(reconnues.__code_regle,
                CASE WHEN candidats.__score_dans >= ${Number(codification.seuilAuto)} AND NOT ${exaequo} THEN ${meilleur} END)`;
            /*
             * La branche du code retenu doit s’accorder avec celle de la ligne, QUELLE QUE SOIT l’origine du
             * code — code déjà fourni dans la liste, règle de mots-clés, libellé appris ou ressemblance.
             *
             * Un même code figure souvent sous PLUSIEURS familles de l’arborescence. La question n’est donc
             * pas « la famille de la ligne est-elle celle de ce code » — il n’y en a pas qu’une — mais
             * « ce code existe-t-il sous la famille de la ligne ». Et quand la réponse est non, on ne nomme
             * pas une famille au hasard : on les nomme TOUTES, pour que l’on voie où ce code vit réellement.
             */
            const brancheConnue = !!(codification.restreindreSource && codification.restreindreNomenclature);
            const brancheDeLaLigne = brancheConnue
                ? v13TexteCompare(`reconnues.${sqlIdent(codification.restreindreSource)}`)
                : 'NULL';
            const cleDuCode = v13TexteCompare('typesPrets.__code_type');
            // Le chemin de ce code DANS la famille de la ligne, quand il y existe.
            const arbreDeLaFamille = `(SELECT ${cleDuCode} AS __cle, __branche_type AS __branche,
                any_value(__chemin_type) AS __chemin_type
                FROM typesPrets GROUP BY 1, 2) arbreFamille`;
            // Un chemin par défaut, et la liste de toutes les familles où ce code existe.
            const arbre = `(SELECT ${cleDuCode} AS __cle, any_value(__chemin_type) AS __chemin_type,
                any_value(__libelle_type) AS __libelle_type,
                array_to_string(list_sort(list_distinct(list(__branche_type))), ', ') AS __familles
                FROM typesPrets GROUP BY 1) arbre`;
            /*
             * Le libellé de la proposition faite DANS la famille de la ligne.
             *
             * Le fichier résultat ne disait rien de cette proposition : il n'imprimait que le code trouvé
             * ailleurs dans l'arbre. Une ligne « Disconnecteur CES » en J01, notée 0,333 contre un
             * disconnecteur de sa propre famille, ressortait avec un code de la famille K04 en face d'elle
             * — et il fallait comprendre que la machine « avait choisi K04 », alors qu'elle n'avait rien
             * choisi du tout et avait bel et bien regardé la famille en premier. On imprime donc les deux.
             */
            const proposeeDansLaFamille = brancheConnue
                ? `(SELECT ${cleDuCode} AS __cle, __branche_type AS __branche,
                any_value(__libelle_type) AS __libelle_type, any_value(__chemin_type) AS __chemin_type
                FROM typesPrets GROUP BY 1, 2) proposee`
                : `(SELECT ${cleDuCode} AS __cle, NULL AS __branche,
                any_value(__libelle_type) AS __libelle_type, any_value(__chemin_type) AS __chemin_type
                FROM typesPrets GROUP BY 1) proposee`;
            /*
             * Et le même service pour le code trouvé HORS de la famille : son libellé et son chemin.
             * Un code seul ne se lit pas — « 37010909.D » ne dit rien tant qu'on n'a pas ouvert la
             * nomenclature en face. On le rend donc lisible là où il s'affiche, comme celui de la famille.
             */
            const trouveeHorsFamille = `(SELECT ${cleDuCode} AS __cle, __branche_type AS __branche,
                any_value(__libelle_type) AS __libelle_type, any_value(__chemin_type) AS __chemin_type
                FROM typesPrets GROUP BY 1, 2) horsFamille`;
            const desaccord = brancheConnue
                ? `(${brancheDeLaLigne} IS NOT NULL AND ${brancheDeLaLigne} <> ''
                AND arbre.__cle IS NOT NULL AND arbreFamille.__cle IS NULL)`
                : 'FALSE';
            // Le code imprimé en face de la ligne quand il vient d'ailleurs : soit le code retenu dont la
            // famille contredit l'arbre, soit le meilleur voisin trouvé hors de la famille de la ligne.
            const codeAutre = `CASE WHEN ${code} IS NOT NULL AND ${desaccord} THEN ${code} ELSE ${hors} END`;
            const seuil = Number(codification.seuilRevoir);
            const statut = `CASE WHEN ${code} IS NOT NULL AND ${desaccord} THEN 'branche'
                WHEN ${code} IS NOT NULL THEN 'office'
                WHEN candidats.__score_dans >= ${seuil} THEN 'revoir'
                WHEN candidats.__score_hors >= ${seuil} AND ${meilleur} IS NULL THEN 'branche'
                WHEN candidats.__score_dans > 0 OR candidats.__score_hors > 0 THEN 'faible'
                ELSE 'absent' END`;
            return `SELECT reconnues.* EXCLUDE (__libelle, __code_regle, __origine_regle),
            ${code} AS __code,
            COALESCE(reconnues.__origine_regle, CASE WHEN ${code} IS NOT NULL THEN 'ressemblance' ELSE 'aucune' END) AS __origine,
            ROUND(COALESCE(candidats.__score_dans, candidats.__score_hors, CASE WHEN reconnues.__code_regle IS NOT NULL THEN 1.0 ELSE 0.0 END), 3) AS __score,
            ${statut} AS __statut,
            COALESCE(arbreFamille.__chemin_type, arbre.__chemin_type, proposee.__chemin_type) AS __chemin,
            CASE WHEN ${code} IS NULL THEN ${meilleur} END AS __code_propose,
            CASE WHEN ${code} IS NULL THEN proposee.__libelle_type END AS __libelle_propose,
            CASE WHEN ${code} IS NULL THEN ROUND(candidats.__score_dans, 3) END AS __score_propose,
            ${codeAutre} AS __code_autre_branche,
            CASE WHEN ${codeAutre} IS NOT NULL
                THEN COALESCE(horsFamille.__libelle_type, arbre.__libelle_type) END AS __libelle_autre_branche,
            CASE WHEN ${codeAutre} IS NOT NULL
                THEN COALESCE(horsFamille.__chemin_type, arbre.__chemin_type) END AS __chemin_autre_branche,
            CASE WHEN ${code} IS NOT NULL AND ${desaccord} THEN arbre.__familles
                WHEN ${hors} IS NOT NULL THEN candidats.__branche_hors END AS __branche_trouvee
        FROM reconnues
        LEFT JOIN candidats ON candidats.__rn = reconnues.__rn
        LEFT JOIN ${arbre} ON arbre.__cle = ${v13TexteCompare(code)}
        LEFT JOIN ${arbreDeLaFamille} ON arbreFamille.__cle = ${v13TexteCompare(code)}
            AND arbreFamille.__branche = ${brancheDeLaLigne}
        LEFT JOIN ${proposeeDansLaFamille} ON proposee.__cle = ${v13TexteCompare(meilleur)}
            AND proposee.__branche IS NOT DISTINCT FROM ${brancheConnue ? brancheDeLaLigne : 'NULL'}
        LEFT JOIN ${trouveeHorsFamille} ON horsFamille.__cle = ${v13TexteCompare(hors)}
            AND horsFamille.__branche IS NOT DISTINCT FROM candidats.__branche_hors`;
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
            /*
             * Le score n’est calculé qu’UNE fois par couple retenu, et l’on garde DEUX choses par ligne :
             * le meilleur voisin dans la bonne branche, et le meilleur voisin hors branche.
             *
             * Le second sert à dire pourquoi une ligne n’a rien trouvé. Sans lui, une ligne dont la famille
             * ne correspond à aucune famille de l’arbre ressortait « non trouvée », sans un mot — alors que
             * le libellé désignait un type parfaitement identifiable, rangé sous une autre branche. C’est
             * une contradiction entre la liste et la nomenclature, et elle doit se voir.
             */
            const notes = `SELECT liste.__rn AS __rn, types.__code_type AS __code_voisin,
                types.__branche_type AS __branche_type,
                (${v13ConditionDeBranche(codification)}) AS __meme_branche,
                (${v13ScoreDeRessemblance(codification)}) AS __score_voisin
            FROM rapprochables p
            JOIN listePrete liste ON liste.__rn = p.__rn
            JOIN typesPrets types ON types.__ligne = p.__ligne`;
            const dansLaBranche = 'CASE WHEN __meme_branche THEN __score_voisin ELSE -1 END';
            const horsBranche = 'CASE WHEN __meme_branche THEN -1 ELSE __score_voisin END';
            const scoreDans = 'max(CASE WHEN __meme_branche THEN __score_voisin END)';
            const scoreHors = 'max(CASE WHEN NOT __meme_branche THEN __score_voisin END)';
            // On retient les DEUX meilleurs : si le second est à égalité avec le premier, la machine ne sait
            // pas choisir, et elle ne doit pas faire semblant. Un regroupement suffit à les obtenir.
            /*
             * On ne jette RIEN sous le seuil.
             *
             * Le meilleur voisin était écarté dès qu'il passait sous le seuil « à revoir » : la ligne
             * ressortait « non trouvée » avec un score de 0, alors que des types partageaient un mot avec
             * elle et avaient bel et bien été notés. « Disconnecteur CES Le Vigneret » contre
             * « Disconnecteur BA zpr-ctr. » vaut 25 % — trop peu pour décider, bien assez pour être montré.
             * Le seuil ne décide plus de ce que l'on garde, seulement du statut que l'on donne.
             */
            const candidats = `SELECT __rn,
                max_by(__code_voisin, ${dansLaBranche}, 2) AS __codes_voisins,
                max_by(__score_voisin, ${dansLaBranche}, 2) AS __scores_voisins,
                ${scoreDans} AS __score_dans,
                max_by(__code_voisin, ${horsBranche}) AS __code_hors,
                max_by(__branche_type, ${horsBranche}) AS __branche_hors,
                ${scoreHors} AS __score_hors
            FROM (\n${notes}\n        ) notes
            GROUP BY __rn`;
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
        /**
         * Le plafond de questions. Zéro ou moins veut dire « toutes » : c’est ce que demande l’export, qui
         * doit rendre la vue complète et non les cinquante premières. L’écran, lui, reste borné.
         */
        function v13PlafondDesCas(combien, depuis) {
            const saute = Math.max(0, Math.round(Number(depuis) || 0));
            const apres = saute ? ` OFFSET ${saute}` : '';
            const demande = Number(combien);
            if (!Number.isFinite(demande)) return ' LIMIT 50' + apres;
            // Un OFFSET sans LIMIT n'a pas de sens : on demande alors tout ce qui reste.
            if (demande > 0) return ` LIMIT ${Math.round(demande)}${apres}`;
            return saute ? ` LIMIT ALL${apres}` : '';
        }
        /**
         * Combien de libellés distincts restent à trancher. C'est ce qui permet de préparer l'export
         * par paquets au lieu de tout demander d'un coup — voir v13SqlDesCasARevoir.
         */
        function v13SqlDuNombreDeCasARevoir(codification, tableCodee) {
            v13VerifierLaCodification(codification);
            const cleDuLibelle = v13Canoniser(v13TexteCompare(`codee.${sqlIdent(codification.colonneLibelle)}`), codification);
            const ecartes = (codification.refus || []).filter(Boolean);
            const sansLesEcartes = ecartes.length ? ` AND ${cleDuLibelle} NOT IN (${ecartes.map(sqlLiteral).join(', ')})` : '';
            return `SELECT COUNT(DISTINCT ${cleDuLibelle})::BIGINT AS cas
        FROM ${sqlIdent(tableCodee || V13_TABLE_CODEE)} codee
        WHERE __statut IN ('revoir', 'branche', 'faible')${sansLesEcartes}`;
        }
        /**
         * « depuis » saute les premiers libellés : c'est ce qui permet de préparer l'export par paquets.
         *
         * Demander les deux cent mille libellés d'un coup faisait tenir en mémoire, en même temps, la table
         * codée entière ET tout le rapprochement refait par-dessus. Le navigateur, qui ne peut pas écrire sur
         * le disque, s'arrêtait. Par paquets, la mémoire ne dépend plus que de la taille d'un paquet.
         */
        function v13SqlDesCasARevoir(codification, combien, tableCodee, depuis) {
            v13VerifierLaCodification(codification);
            const tableNomenclature = sqlIdent(duckTableName(tableByName(codification.nomenclature).id));
            /*
             * La table codée est déjà calculée : on ne recode pas la liste pour la relire. Seules les
             * quelques lignes à trancher sont préparées, puis rapprochées comme à la codification.
             *
             * Les propositions ne sont PAS filtrées par la branche : celles de la bonne branche passent
             * devant, mais on montre aussi ce que l’on a trouvé ailleurs. C’est ce qui permet de voir que la
             * famille portée par la ligne contredit celle de l’arbre, et de trancher en connaissance de cause.
             */
            /*
             * Une question par LIBELLÉ, pas une par ligne.
             *
             * Le même libellé revient des centaines de fois dans une liste reçue. Posée ligne à ligne, la
             * revue reposait la même question autant de fois, et les cinquante places disponibles partaient
             * en doublons d’une poignée de libellés. On regroupe donc par libellé ramené aux mots retenus,
             * les plus fréquents d’abord : une décision, et toutes les lignes qui portent ce libellé sont
             * codées d’un coup. Les libellés déjà écartés à la main ne sont plus reproposés.
             */
            const cleDuLibelle = v13Canoniser(v13TexteCompare(`codee.${sqlIdent(codification.colonneLibelle)}`), codification);
            const ecartes = (codification.refus || []).filter(Boolean);
            const sansLesEcartes = ecartes.length ? ` AND ${cleDuLibelle} NOT IN (${ecartes.map(sqlLiteral).join(', ')})` : '';
            return `WITH clesARevoir AS (
            SELECT ${cleDuLibelle} AS __cle, COUNT(*) AS __combien, min(codee.__rn) AS __rn
            FROM ${sqlIdent(tableCodee || V13_TABLE_CODEE)} codee
            WHERE __statut IN ('revoir', 'branche', 'faible')${sansLesEcartes}
            GROUP BY 1 ORDER BY __combien DESC, __rn${v13PlafondDesCas(combien, depuis)}
        ), aCoder AS (
            SELECT codee.*, CAST(codee.${sqlIdent(codification.colonneLibelle)} AS VARCHAR) AS __texte,
                clesARevoir.__combien AS __combien
            FROM ${sqlIdent(tableCodee || V13_TABLE_CODEE)} codee
            JOIN clesARevoir ON clesARevoir.__rn = codee.__rn
        ), listePrete AS MATERIALIZED (\n${v13ListePreparee(codification, 'aCoder r')}\n
        ), typesPrets AS MATERIALIZED (\n${v13TypesPrepares(codification, tableNomenclature)}\n
        ), rapprochables AS (\n    ${v13SqlDesRapprochables(codification)}\n
        ), notes AS (
            SELECT liste.__rn AS rang, aCoder.__texte AS libelle, aCoder.__combien AS combien,
                ${codification.restreindreSource ? v13TexteCompare(`aCoder.${sqlIdent(codification.restreindreSource)}`) : "''"} AS famille, CAST(types.__code_type AS VARCHAR) AS code,
                types.__libelle_type AS libelleRef, types.__chemin_type AS chemin,
                (${v13ConditionDeBranche(codification)}) AS memeBranche,
                ROUND((${v13ScoreDeRessemblance(codification)}), 3) AS score
            FROM rapprochables p
            JOIN listePrete liste ON liste.__rn = p.__rn
            JOIN aCoder ON aCoder.__rn = liste.__rn
            JOIN typesPrets types ON types.__ligne = p.__ligne
        ), meilleures AS (
            /*
             * Ne garder que les meilleures propositions, SANS trier tout ce qui a été noté.
             *
             * Un classement par fenêtre (« row_number() OVER … ORDER BY score ») oblige le moteur à ranger
             * l'intégralité des couples notés avant d'en jeter la quasi-totalité. Sur une liste entière —
             * plus de deux cent mille libellés à revoir, chacun contre des dizaines de types — cela veut dire
             * des dizaines de millions de lignes à trier en mémoire, et le navigateur, qui ne peut pas écrire
             * sur le disque, s'arrête. « max_by » fait le même travail en ne retenant que les meilleures au
             * passage : la mémoire ne dépend plus que du nombre de libellés, plus de celui des couples.
             *
             * Les quatre valeurs d'une proposition voyagent dans une seule structure : séparées, quatre
             * « max_by » pourraient départager deux ex æquo différemment et mélanger un code avec le libellé
             * d'un autre.
             */
            SELECT rang, memeBranche, any_value(libelle) AS libelle, any_value(combien) AS combien,
                any_value(famille) AS famille,
                max_by({'code': code, 'libelleRef': libelleRef, 'chemin': chemin, 'score': score},
                    score, ${Math.max(v13CombienDePropositions(codification), V13_CANDIDATS_ELARGIS)}) AS tetes
            FROM notes WHERE score > 0 GROUP BY rang, memeBranche
        ), retenues AS (
            SELECT rang, libelle, combien, famille, memeBranche,
                unnest(list_slice(tetes, 1, CASE WHEN memeBranche
                    THEN ${v13CombienDePropositions(codification)} ELSE ${V13_CANDIDATS_ELARGIS} END)) AS tete
            FROM meilleures
        )
        SELECT rang, libelle, combien, famille, tete.code AS code, tete.libelleRef AS libelleRef,
            tete.chemin AS chemin, memeBranche, tete.score AS score
        FROM retenues
        ORDER BY rang, memeBranche DESC, score DESC`;
        }

        /**
         * Ce qu’il faut dire quand la codification échoue. La plupart des échecs viennent de la mémoire du
         * navigateur : le message brut de DuckDB parle alors de fichiers temporaires, ce qui n’aide personne.
         * On le remplace par ce que l’on peut réellement faire.
         */
        function v13ManqueDeMemoire(erreur) {
            return /do not support writing|temp_directory|temporary|out of memory|memory limit|cannot allocate|Failed to allocate/i.test(
                String((erreur && erreur.message) || erreur)
            );
        }
        function v13PhraseDeLErreur(erreur) {
            const message = String((erreur && erreur.message) || erreur);
            if (!v13ManqueDeMemoire(erreur)) return message;
            return (
                'la mémoire du navigateur n’a pas suffi, et ce navigateur ne permet pas d’écrire sur le disque. ' +
                'Renseignez « Chercher dans la bonne branche » pour ne comparer que dans la famille de chaque ligne, ' +
                'retirez les comparaisons les moins utiles, ou codez la liste en plusieurs morceaux. Détail : ' +
                message
            );
        }

        /**
         * Ce qui cloche sur une ligne rangée en « autre branche », dit d’une phrase. On nomme l’origine du
         * code, la famille portée par la ligne, et celles où ce code existe vraiment : c’est de quoi décider
         * si c’est la famille de la liste qui est fausse, ou l’arborescence qui est incomplète.
         */
        function v13PhraseDuDesaccord(ligne, codification) {
            const code = String((ligne || {}).__code || (ligne || {}).__code_autre_branche || '');
            const familles = String((ligne || {}).__branche_trouvee || '');
            const famille = codification.restreindreSource ? String(ligne[codification.restreindreSource] || '') : '';
            const parQuoi = v13PhraseDeLOrigine((ligne || {}).__origine, codification.regles);
            if (!code) return '';
            if ((ligne || {}).__code)
                return `Le code ${code} vient du ${parQuoi}, mais il n’existe pas sous « ${famille} » : on le trouve sous ${familles || '—'}.`;
            return `Rien ne correspond sous « ${famille} ». Le libellé désigne le code ${code}, rangé sous ${familles || '—'}.`;
        }

        /**
         * Le contrôle de la colonne de branche : les familles de la liste existent-elles dans l’arbre ?
         *
         * C’est la première chose à vérifier quand une ligne ne reçoit aucune proposition de sa famille. Deux
         * colonnes peuvent porter le même nom et ne pas dire la même chose : « CHAUDIERE » d’un côté et
         * « J01 » de l’autre ne se rencontreront jamais, et tout finit « dans une autre branche » sans que
         * l’on comprenne pourquoi. On compte donc les lignes par famille, et l’on dit lesquelles l’arbre
         * ignore.
         */
        function v13SqlDuControleDeBranche(codification) {
            v13VerifierLaCodification(codification);
            if (!codification.restreindreSource || !codification.restreindreNomenclature) return '';
            const tableSource = sqlIdent(duckTableName(tableByName(codification.source).id));
            const tableNomenclature = sqlIdent(duckTableName(tableByName(codification.nomenclature).id));
            const cote = v13TexteCompare(`liste.${sqlIdent(codification.restreindreSource)}`);
            const autre = v13TexteCompare(`arbre.${sqlIdent(codification.restreindreNomenclature)}`);
            return `WITH famillesDeLaListe AS (
            SELECT ${cote} AS famille, COUNT(*)::BIGINT AS lignes FROM ${tableSource} liste GROUP BY 1
        ), famillesDeLArbre AS (
            SELECT DISTINCT ${autre} AS famille FROM ${tableNomenclature} arbre
        )
        SELECT famillesDeLaListe.famille AS famille, famillesDeLaListe.lignes AS lignes,
            (famillesDeLArbre.famille IS NOT NULL) AS connue
        FROM famillesDeLaListe LEFT JOIN famillesDeLArbre ON famillesDeLArbre.famille = famillesDeLaListe.famille
        ORDER BY connue, lignes DESC`;
        }
        /**
         * Quelle colonne de l'autre fichier reconnaît le mieux les valeurs de la colonne choisie ?
         *
         * Quand aucune proposition ne vient de la famille de la ligne, c'est presque toujours que les deux
         * colonnes de branche ne parlent pas de la même chose : « CHAUDIERE » d'un côté, « J01 » de l'autre.
         * Dire « elles ne correspondent pas » ne suffit pas — il faut dire LAQUELLE il aurait fallu prendre.
         * On essaie donc chacune des colonnes de l'autre fichier et l'on compte ce qu'elle reconnaît.
         */
        function v13SqlDesColonnesDeBranche(codification, cote) {
            v13VerifierLaCodification(codification);
            if (!codification.restreindreSource || !codification.restreindreNomenclature) return '';
            const surLaListe = cote === 'liste';
            const nomChoisi = surLaListe ? codification.restreindreNomenclature : codification.restreindreSource;
            const nomEssaye = surLaListe ? codification.source : codification.nomenclature;
            const tableChoisie = tableByName(surLaListe ? codification.nomenclature : codification.source);
            const tableEssayee = tableByName(nomEssaye);
            const colonnes = (tableEssayee.headers || []).filter(Boolean);
            if (!colonnes.length) return '';
            const referentes = `SELECT DISTINCT ${v13TexteCompare(`choisie.${sqlIdent(nomChoisi)}`)} AS valeur
        FROM ${sqlIdent(duckTableName(tableChoisie.id))} choisie
        WHERE NOT ${v13EstVide(`choisie.${sqlIdent(nomChoisi)}`)}`;
            const essais = colonnes
                .map(colonne => {
                    const valeur = v13TexteCompare(`essayee.${sqlIdent(colonne)}`);
                    return `SELECT ${sqlLiteral(colonne)} AS colonne,
            COUNT(*) FILTER (WHERE ${valeur} IN (SELECT valeur FROM referentes))::BIGINT AS reconnues,
            COUNT(*) FILTER (WHERE NOT ${v13EstVide(`essayee.${sqlIdent(colonne)}`)})::BIGINT AS remplies
        FROM ${sqlIdent(duckTableName(tableEssayee.id))} essayee`;
                })
                .join('\n        UNION ALL\n        ');
            return `WITH referentes AS (\n        ${referentes}\n    )\n        ${essais}\n        ORDER BY reconnues DESC`;
        }
        /**
         * Ce que l'essai des colonnes conseille, en une phrase. On ne conseille que si une colonne fait
         * nettement mieux que celle qui est déclarée : sinon on se tait plutôt que d'envoyer sur une piste.
         */
        function v13ConseilDeColonne(lignes, colonneDeclaree, nomDuFichier) {
            const rangees = (lignes || [])
                .map(ligne => ({
                    colonne: String(ligne.colonne || ''),
                    part: Number(ligne.remplies) ? Number(ligne.reconnues) / Number(ligne.remplies) : 0
                }))
                .sort((une, autre) => autre.part - une.part);
            const declaree = rangees.find(ligne => ligne.colonne === colonneDeclaree);
            const meilleure = rangees[0];
            const partDeclaree = declaree ? declaree.part : 0;
            if (!meilleure || meilleure.part < 0.5 || meilleure.colonne === colonneDeclaree) return '';
            if (meilleure.part <= partDeclaree + 0.2) return '';
            const pourCent = part => Math.round(100 * part) + ' %';
            return `Dans ${nomDuFichier}, la colonne « ${meilleure.colonne} » reconnaît ${pourCent(meilleure.part)} de ces valeurs, contre ${pourCent(partDeclaree)} pour « ${colonneDeclaree} ». C'est sans doute elle qu'il faut choisir.`;
        }

        /** Combien on nomme de familles inconnues avant de dire « et d’autres ». */
        const V13_FAMILLES_NOMMEES = 6;
        /**
         * Ce que dit le contrôle, en français. Le cas le plus grave — AUCUNE famille de la liste ne se
         * retrouve dans l’arbre — veut presque toujours dire que l’une des deux colonnes n’est pas la bonne.
         */
        function v13BilanDuControleDeBranche(lignes) {
            const enFrancais = nombre => Number(nombre || 0).toLocaleString('fr-FR');
            const rangees = (lignes || []).map(ligne => ({
                famille: String(ligne.famille || ''),
                lignes: Number(ligne.lignes) || 0,
                connue: !!ligne.connue
            }));
            const inconnues = rangees.filter(ligne => !ligne.connue && ligne.famille);
            const connues = rangees.filter(ligne => ligne.connue);
            const lignesInconnues = inconnues.reduce((somme, ligne) => somme + ligne.lignes, 0);
            const nommees = inconnues
                .slice(0, V13_FAMILLES_NOMMEES)
                .map(ligne => `« ${ligne.famille} »`)
                .join(', ');
            const etDAutres =
                inconnues.length > V13_FAMILLES_NOMMEES ? `, et ${inconnues.length - V13_FAMILLES_NOMMEES} autre(s)` : '';
            // La liste des familles connues sert à expliquer, cas par cas, pourquoi rien n’a été proposé.
            const familles = connues.map(ligne => ligne.famille);
            if (!rangees.length) return { accord: true, lignesInconnues: 0, familles, phrase: '' };
            if (!inconnues.length)
                return {
                    accord: true,
                    lignesInconnues: 0,
                    familles,
                    phrase: `Les ${connues.length} famille(s) de la liste existent toutes dans la nomenclature.`
                };
            if (!connues.length)
                return {
                    accord: false,
                    lignesInconnues,
                    familles,
                    phrase: `AUCUNE famille de la liste ne se retrouve dans la nomenclature : ${nommees}${etDAutres}. Les deux colonnes de branche ne parlent pas de la même chose — vérifiez laquelle vous avez choisie de chaque côté.`
                };
            return {
                accord: false,
                lignesInconnues,
                familles,
                phrase: `${enFrancais(lignesInconnues)} ligne(s) portent une famille que la nomenclature ne connaît pas : ${nommees}${etDAutres}. Ces lignes ne peuvent recevoir aucune proposition de leur famille.`
            };
        }

        /**
         * Les libellés écartés à la main : « pour celui-là, aucun type ne convient ». Sans cette mémoire, la
         * revue reposait la question à chaque exécution, et l’on repassait éternellement sur les mêmes.
         * On range le libellé ramené aux mots retenus, donc toutes ses façons de s’écrire sont couvertes.
         */
        function v13RefusApresDecision(codification, libelle) {
            const compare = v13MotRetenuDuTexte(libelle, codification);
            const refus = (codification.refus || []).filter(Boolean);
            if (!compare || refus.includes(compare)) return refus;
            return refus.concat([compare]);
        }
        /** Un libellé que l’on avait écarté et sur lequel on revient : il redevient une question. */
        function v13RefusSansLeLibelle(codification, libelle) {
            const compare = v13MotRetenuDuTexte(libelle, codification);
            return (codification.refus || []).filter(candidate => candidate && candidate !== compare);
        }

        /**
         * Tout ce que l’on a décidé jusqu’ici, rassemblé en un seul endroit pour être relu, retiré, vidé.
         *
         * Une décision vit à trois endroits : le libellé APPRIS (« cette écriture-là vaut ce code », c’est
         * elle qui code toutes les lignes portant ce libellé, aujourd’hui et à la prochaine livraison), le
         * libellé ÉCARTÉ (« aucune proposition ne convient, ne me le redemandez plus ») et, en dessous, la
         * décision prise sur une ligne précise. Sans écran pour les voir, elles s’accumulaient à l’aveugle.
         */
        function v13DecisionsPrises(codification) {
            const apprises = (codification.correspondances || [])
                .filter(correspondance => correspondance && correspondance.libelle && correspondance.code)
                .map(correspondance => ({
                    libelle: String(correspondance.libelle),
                    code: String(correspondance.code),
                    auteur: String(correspondance.auteur || ''),
                    le: String(correspondance.le || '')
                }));
            const ecartees = (codification.refus || []).filter(Boolean).map(String);
            const surUneLigne = Object.keys(codification.decisions || {}).length;
            return { apprises, ecartees, surUneLigne, combien: apprises.length + ecartees.length };
        }
        /** Ce que dit l’écran quand on n’a encore rien décidé, ou ce que l’on a décidé, en une phrase. */
        function v13PhraseDesDecisions(decisions) {
            const compte = (nombre, un, plusieurs) => `${nombre.toLocaleString('fr-FR')} ${nombre > 1 ? plusieurs : un}`;
            if (!decisions.combien)
                return 'Vous n’avez encore rien décidé : cette liste se remplira au fur et à mesure de la revue.';
            const morceaux = [];
            if (decisions.apprises.length)
                morceaux.push(compte(decisions.apprises.length, 'libellé appris', 'libellés appris'));
            if (decisions.ecartees.length)
                morceaux.push(compte(decisions.ecartees.length, 'libellé écarté', 'libellés écartés'));
            return `${morceaux.join(' et ')}. Ces choix sont rejoués à chaque codification — y compris sur une livraison plus récente.`;
        }
        /**
         * Oublier ce qui a été décidé sur un libellé : il redevient une question à la prochaine codification.
         *
         * On retire aussi les décisions prises ligne à ligne qui portaient ce code. Le lien entre une ligne et
         * le libellé qui l’a fait coder n’est pas conservé : on en retire donc une de trop dans le cas rare où
         * deux libellés différents ont mené au même code. Aucune information n’est perdue pour autant —
         * l’autre libellé reste appris, et il code ses lignes comme avant.
         */
        function v13SansCetteDecision(codification, libelle) {
            const correspondances = v13CorrespondanceApresDecision(codification, libelle, '');
            const retire = (codification.correspondances || []).find(
                correspondance =>
                    correspondance &&
                    v13MotRetenuDuTexte(correspondance.libelle, codification) === v13MotRetenuDuTexte(libelle, codification)
            );
            const code = retire ? String(retire.code) : '';
            const decisions = {};
            Object.keys(codification.decisions || {}).forEach(rang => {
                if (!code || String(codification.decisions[rang]) !== code) decisions[rang] = codification.decisions[rang];
            });
            return { correspondances, refus: v13RefusSansLeLibelle(codification, libelle), decisions };
        }
        /** Tout vider : on repart des seules règles déclarées, sans aucun choix appris. */
        function v13DecisionsVidees() {
            return { correspondances: [], refus: [], decisions: {} };
        }
        /** Les décisions en CSV, pour les relire ailleurs, les faire valider, ou les garder. */
        function v13CsvDesDecisions(codification) {
            const decisions = v13DecisionsPrises(codification);
            const cellule = valeur => {
                const ecrit = String(valeur === null || valeur === undefined ? '' : valeur);
                return /[;"\n]/.test(ecrit) ? '"' + ecrit.replace(/"/g, '""') + '"' : ecrit;
            };
            const lignes = [['libelle', 'decision', 'code', 'par', 'le']];
            decisions.apprises.forEach(apprise =>
                lignes.push([apprise.libelle, 'appris', apprise.code, apprise.auteur, apprise.le])
            );
            decisions.ecartees.forEach(ecartee => lignes.push([ecartee, 'ecarte', '', '', '']));
            return lignes.map(ligne => ligne.map(cellule).join(';')).join('\r\n');
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
            lignes.push({
                intitule: 'Propositions montrées',
                valeur: `${v13CombienDePropositions(codification)} dans la famille de la ligne, puis ${V13_CANDIDATS_ELARGIS} prises ailleurs dans l’arbre`
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
            const branche = compte('branche');
            const faible = compte('faible');
            const absent = compte('absent');
            const total = office + revoir + branche + faible + absent;
            const couverture = total ? Math.round((1000 * office) / total) / 1000 : 0;
            const enFrancais = nombre => Number(nombre).toLocaleString('fr-FR');
            if (!total) return { total, office, revoir, branche, faible, absent, couverture, phrase: 'Aucune ligne à coder.' };
            const restes = [];
            if (revoir) restes.push(`${enFrancais(revoir)} à revoir`);
            if (branche) restes.push(`${enFrancais(branche)} trouvée(s) dans une autre branche`);
            if (faible) restes.push(`${enFrancais(faible)} à proposition faible`);
            if (absent) restes.push(`${enFrancais(absent)} sans proposition`);
            const reste = restes.length ? ` — ${restes.join(', ')}.` : ' — rien à revoir.';
            return {
                total,
                office,
                revoir,
                branche,
                faible,
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
            if (bilan.branche)
                return `${bilan.branche} ligne(s) désignent un type rangé sous une AUTRE branche que leur famille : vérifiez la famille de ces lignes, ou la colonne de branche que vous avez choisie.`;
            if (bilan.revoir)
                return `Passez les ${bilan.revoir} cas à revoir : chaque décision servira aux prochaines livraisons.`;
            if (bilan.faible)
                return `${bilan.faible} ligne(s) n'ont que des propositions faibles : elles partagent un mot avec un type sans lui ressembler assez. Regardez-les, baissez le seuil « à revoir », ou ajoutez un synonyme.`;
            if (bilan.absent)
                return `${bilan.absent} ligne(s) sans proposition : ajoutez une règle de mots-clés pour les attraper.`;
            return 'Tout est codé : le résultat peut partir.';
        }
