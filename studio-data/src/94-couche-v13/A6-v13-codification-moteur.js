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

        /** La part des mots du libellé de référence que l'on retrouve dans le libellé lu. */
        function v13MotsRetrouves(lu, reference) {
            const mots = `string_split(${reference}, ' ')`;
            const retrouve = `len(list_filter(string_split(${lu}, ' '),
                motLu -> motLu = motRef OR (length(motRef) >= ${V13_LETTRES_POUR_TOLERER_UNE_FAUTE}
                    AND jaro_winkler_similarity(motLu, motRef) >= ${V13_TOLERANCE_PAR_MOT}))) > 0`;
            return `list_aggregate(list_transform(${mots}, motRef -> CASE WHEN ${retrouve} THEN 1 ELSE 0 END), 'sum')::DOUBLE
                / GREATEST(len(${mots}), 1)`;
        }
        /** La ressemblance de deux textes, selon la méthode choisie ; 1 = identiques, 0 = rien à voir. */
        function v13Ressemblance(gauche, droite, methode) {
            const vide = `${gauche} IS NULL OR ${droite} IS NULL OR ${gauche} = '' OR ${droite} = ''`;
            if (methode === 'lev')
                return `CASE WHEN ${vide} THEN 0.0
                    ELSE 1.0 - levenshtein(${gauche}, ${droite})::DOUBLE / GREATEST(length(${gauche}), length(${droite}), 1) END`;
            if (methode === 'jw') return `CASE WHEN ${vide} THEN 0.0 ELSE jaro_winkler_similarity(${gauche}, ${droite}) END`;
            return `CASE WHEN ${vide} THEN 0.0 ELSE ${v13MotsRetrouves(gauche, droite)} END`;
        }
        /** La condition qui enferme la recherche dans la bonne branche — vraie partout si l'on ne restreint pas. */
        function v13ConditionDeBranche(codification) {
            if (!codification.restreindreSource || !codification.restreindreNomenclature) return 'TRUE';
            const cote = v13TexteCompare(`s.${sqlIdent(codification.restreindreSource)}`);
            const autre = v13TexteCompare(`n.${sqlIdent(codification.restreindreNomenclature)}`);
            // Une ligne sans famille connue n'est pas exclue : on la cherche dans tout l'arbre.
            return `(${cote} = ${autre} OR ${v13EstVide(`s.${sqlIdent(codification.restreindreSource)}`)})`;
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
            if (!lignes.length) return '';
            const valeurs = lignes.map(ligne => `(${sqlLiteral(ligne.libelle)}, ${sqlLiteral(ligne.code)})`).join(', ');
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
        function v13SelectFinal(codification, tableNomenclature) {
            const code = `COALESCE(reconnues.__code_regle,
                CASE WHEN candidats.__score_voisin >= ${Number(codification.seuilAuto)} THEN candidats.__code_voisin END)`;
            const statut = `CASE WHEN ${code} IS NOT NULL THEN 'office'
                WHEN candidats.__code_voisin IS NOT NULL THEN 'revoir' ELSE 'absent' END`;
            const niveaux = (codification.niveaux || []).filter(Boolean);
            const chemin = niveaux.length
                ? `concat_ws(' › ', ${niveaux.map(niveau => `CAST(arbre.${sqlIdent(niveau)} AS VARCHAR)`).join(', ')})`
                : 'NULL';
            return `SELECT reconnues.* EXCLUDE (__libelle, __code_regle, __origine_regle),
            ${code} AS __code,
            COALESCE(reconnues.__origine_regle, CASE WHEN ${code} IS NOT NULL THEN 'ressemblance' ELSE 'aucune' END) AS __origine,
            ROUND(COALESCE(candidats.__score_voisin, CASE WHEN reconnues.__code_regle IS NOT NULL THEN 1.0 ELSE 0.0 END), 3) AS __score,
            ${statut} AS __statut,
            ${chemin} AS __chemin
        FROM reconnues
        LEFT JOIN candidats ON candidats.__rn = reconnues.__rn
        LEFT JOIN ${tableNomenclature} arbre ON ${v13TexteCompare(`arbre.${sqlIdent(codification.colonneCode)}`)} = ${v13TexteCompare(code)}`;
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
            const libelleDeReference = v13Canoniser(
                v13TexteCompare(`n.${sqlIdent(codification.colonneLibelleRef)}`),
                codification
            );
            const score = v13Ressemblance('r.__libelle', libelleDeReference, codification.methode);
            const candidats = `SELECT r.__rn AS __rn, n.${sqlIdent(codification.colonneCode)} AS __code_voisin, (${score}) AS __score_voisin
            FROM reconnues r
            JOIN ${tableNomenclature} n ON ${v13ConditionDeBranche(codification).replace(/\bs\./g, 'r.')}
            WHERE r.__code_regle IS NULL AND (${score}) >= ${Number(codification.seuilRevoir)}
            QUALIFY row_number() OVER (PARTITION BY r.__rn ORDER BY __score_voisin DESC) = 1`;
            const decisions = v13SqlDesDecisions(codification);
            const codee = `WITH reconnues AS (\n${reconnues}\n), candidats AS (\n${candidats}\n)\n${v13SelectFinal(codification, tableNomenclature)}`;
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
        function v13SqlDesCasARevoir(codification, combien) {
            v13VerifierLaCodification(codification);
            const tableNomenclature = sqlIdent(duckTableName(tableByName(codification.nomenclature).id));
            const codeRef = sqlIdent(codification.colonneCode);
            const libelleRef = sqlIdent(codification.colonneLibelleRef);
            const score = v13Ressemblance(
                'aCoder.__libelle',
                v13Canoniser(v13TexteCompare(`n.${libelleRef}`), codification),
                codification.methode
            );
            const niveaux = (codification.niveaux || []).filter(Boolean);
            const chemin = niveaux.length
                ? `concat_ws(' › ', ${niveaux.map(niveau => `CAST(n.${sqlIdent(niveau)} AS VARCHAR)`).join(', ')})`
                : `CAST(n.${codeRef} AS VARCHAR)`;
            const libelleLu = v13Canoniser(v13TexteCompare(`codee.${sqlIdent(codification.colonneLibelle)}`), codification);
            return `WITH codee AS (\n${v13SqlDeCodification(codification)}\n), aCoder AS (
            SELECT __rn, ${libelleLu} AS __libelle, CAST(codee.${sqlIdent(codification.colonneLibelle)} AS VARCHAR) AS __texte
            FROM codee WHERE __statut = 'revoir' ORDER BY __rn LIMIT ${Number(combien) || 50}
        )
        SELECT aCoder.__rn AS rang, aCoder.__texte AS libelle, CAST(n.${codeRef} AS VARCHAR) AS code,
            CAST(n.${libelleRef} AS VARCHAR) AS libelleRef, ${chemin} AS chemin, ROUND((${score}), 3) AS score
        FROM aCoder JOIN ${tableNomenclature} n ON (${score}) > 0
        QUALIFY row_number() OVER (PARTITION BY aCoder.__rn ORDER BY score DESC) <= ${V13_CANDIDATS_MONTRES}
        ORDER BY rang, score DESC`;
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
