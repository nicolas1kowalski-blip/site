        // ======================= V13 : CLÉ COMPOSITE D'UN LIEN, ET CONTRÔLE DES TABLES LIÉES =======================
        // Le piège est classique et silencieux. Une table liste des éléments, chacun rangé dans un groupe ; une
        // autre les classe dans un arbre. Un élément n'apparaît qu'une fois par groupe, mais appartient à
        // plusieurs groupes. Joint sur le seul élément, l'arbre fait revenir chaque ligne autant de fois qu'il y
        // a de groupes : les totaux deviennent faux sans rien signaler — un total faux a l'air d'un total.
        //
        // Deux réponses, ici réunies :
        //   1. la CLÉ DU LIEN devient composite — on déclare dans le modèle de données les colonnes qui
        //      s'ajoutent à la correspondance (le groupe, la date, la version…), et toutes les extractions qui
        //      empruntent ce lien en profitent, sans rien reparamétrer ;
        //   2. le CONTRÔLE prévient — avant d'extraire, on compte les lignes après chaque table liée et l'on dit
        //      laquelle multiplie, parce que personne ne vérifie une multiplication qu'il ne soupçonne pas.
        //
        // Le moteur d'extraction (80-extraction-avancee.js) n'est pas modifié : on se greffe sur advPlanJoins
        // (conditions de jointure), renderRelationsList (colonne « Clé du lien ») et renderAdvExtract (bouton).
        //
        // Forme de la clé composite sur une relation : relation.extraCols = [{ sourceCol, targetCol }, …]

        /**
         * Les conditions qui s'ajoutent à la clé d'un lien, nettoyées de ce qui n'existe plus. Chaque côté nomme
         * sa table : la colonne qui complète la clé n'est pas toujours portée par les deux bouts du lien.
         */
        function v13ConditionsDeLaCle(relation) {
            const colonnesDe = tableId => (state.tables[tableId] || {}).headers || [];
            return (relation && Array.isArray(relation.extraCols) ? relation.extraCols : []).filter(
                condition =>
                    condition &&
                    colonnesDe(condition.deTable).includes(condition.deColonne) &&
                    colonnesDe(condition.versTable).includes(condition.versColonne)
            );
        }
        /** Au-delà, la clé n'est plus lisible et le lien mérite d'être repensé. */
        const V13_CONDITIONS_MAXIMUM = 6;
        /**
         * Les conditions d'un lien rapportées à la table que la jointure vient d'atteindre : une condition ne
         * s'applique que si l'un de ses deux côtés porte sur cette table — c'est elle qu'elle contraint. L'autre
         * côté désigne la table comparée, où qu'elle soit dans le modèle.
         */
        function v13ConditionsPourLaTable(relation, tableJointe) {
            return v13ConditionsDeLaCle(relation)
                .map(condition => {
                    if (condition.versTable === tableJointe)
                        return {
                            colonneJointe: condition.versColonne,
                            tableComparee: condition.deTable,
                            colonneComparee: condition.deColonne
                        };
                    if (condition.deTable === tableJointe)
                        return {
                            colonneJointe: condition.deColonne,
                            tableComparee: condition.versTable,
                            colonneComparee: condition.versColonne
                        };
                    return null;
                })
                .filter(Boolean);
        }

        // ---- 1. Greffe sur le moteur : les conditions supplémentaires de la jointure ----
        /** Normalisation identique à celle du moteur : casse et espaces ignorés des deux côtés. */
        function v13ComparaisonNormalisee(gauche, droite) {
            return `UPPER(TRIM(CAST(${gauche} AS VARCHAR))) = UPPER(TRIM(CAST(${droite} AS VARCHAR)))`;
        }
        /** Toutes les tables qu'un plan doit comparer, d'après les clés des liens qu'il emprunte. */
        function v13TablesComparees(plan) {
            const tables = [];
            (plan.joins || []).forEach(jointure =>
                v13ConditionsPourLaTable(jointure.rel, jointure.id).forEach(condition => tables.push(condition.tableComparee))
            );
            return [...new Set(tables)];
        }
        /**
         * Complète la condition d'une jointure avec les conditions de la clé du lien. La table comparée doit
         * déjà être jointe : « aliasDisponible » ne connaît que les jointures posées avant celle-ci. Une
         * condition dont la table manque est laissée de côté — le contrôle des tables liées la signalera.
         */
        function v13ConditionDeJointure(jointure, aliasDisponible) {
            const enPlus = v13ConditionsPourLaTable(jointure.rel, jointure.id)
                .map(condition => {
                    const aliasCompare = aliasDisponible(condition.tableComparee);
                    if (!aliasCompare) return null;
                    return v13ComparaisonNormalisee(
                        jointure.alias + '.' + sqlIdent(condition.colonneJointe),
                        aliasCompare + '.' + sqlIdent(condition.colonneComparee)
                    );
                })
                .filter(Boolean);
            return enPlus.length ? [jointure.on].concat(enPlus).join(' AND ') : jointure.on;
        }
        /** Combien de fois l'on redemande un plan pour ramener les tables comparées, sans boucler. */
        const V13_PASSES_DE_PLAN = 3;
        Studio.extend(
            'advPlanJoins',
            base =>
                function (baseId, needs) {
                    const besoins = Array.isArray(needs) ? needs.slice() : [];
                    let plan = base(baseId, besoins);
                    // Les tables comparées par une clé sont jointes d'office, et AVANT celles qui en dépendent :
                    // on les place en tête des besoins, là où le moteur pose ses premières jointures.
                    for (let passe = 0; passe < V13_PASSES_DE_PLAN; passe++) {
                        const manquantes = v13TablesComparees(plan).filter(
                            tableId => tableId !== baseId && !plan.map[advRouteKey(tableId, '')]
                        );
                        if (!manquantes.length) break;
                        besoins.unshift(...manquantes.map(tableId => ({ tableId, via: '' })));
                        plan = base(baseId, besoins);
                    }
                    if (plan && plan.joins) {
                        const aliasParTable = { [baseId]: 'x0' };
                        plan.joins.forEach(jointure => {
                            jointure.on = v13ConditionDeJointure(jointure, tableId => aliasParTable[tableId]);
                            if (!aliasParTable[jointure.id]) aliasParTable[jointure.id] = jointure.alias;
                        });
                        // Mémorisé pour le contrôle : ce sont exactement les jointures que l'extraction va poser.
                        v13State.dernierPlan = { baseId, joins: plan.joins.slice() };
                    }
                    return plan;
                }
        );

        // ---- 2. Écran Modèle de données : la ligne « Clé du lien » ----
        // Les listes gardent leur valeur d'un rendu à l'autre : c'est la saisie en cours, pas l'état du lien.
        const v13SaisieDesCles = {};
        /** La saisie en cours d'une condition : ce qu'affichent les quatre listes, ou ce qu'elles affichaient. */
        function v13ConditionSaisie(relationId) {
            const valeur = suffixe => {
                const identifiant = 'v13-cle-' + suffixe + '-' + relationId;
                const champ = el(identifiant);
                return (champ ? champ.value : v13SaisieDesCles[identifiant]) || '';
            };
            return {
                deTable: valeur('table-contrainte'),
                deColonne: valeur('colonne-contrainte'),
                versTable: valeur('table-comparee'),
                versColonne: valeur('colonne-comparee')
            };
        }
        /** Ajoute au lien la condition choisie, si elle est complète et n'y est pas déjà. */
        function v13AjouterALaCle(relationId) {
            const relation = (state.relations || []).find(r => r.id === relationId);
            const condition = v13ConditionSaisie(relationId);
            if (!relation) return;
            if (!condition.deTable || !condition.deColonne || !condition.versTable || !condition.versColonne)
                return showError('Choisissez une table et une colonne de chaque côté.');
            relation.extraCols = Array.isArray(relation.extraCols) ? relation.extraCols : [];
            if (relation.extraCols.length >= V13_CONDITIONS_MAXIMUM)
                return showError(`Une clé de lien ne peut pas dépasser ${V13_CONDITIONS_MAXIMUM} conditions en plus.`);
            if (condition.deTable === condition.versTable && condition.deColonne === condition.versColonne)
                return showError('Une colonne comparée à elle-même ne contraint rien.');
            if (relation.extraCols.some(autre => JSON.stringify(autre) === JSON.stringify(condition))) return;
            relation.extraCols.push(condition);
            persistAppState();
            renderRelationsList();
        }
        /** Retire la condition de rang donné de la clé du lien. */
        function v13RetirerDeLaCle(relationId, rang) {
            const relation = (state.relations || []).find(r => r.id === relationId);
            if (!relation || !Array.isArray(relation.extraCols)) return;
            relation.extraCols.splice(rang, 1);
            persistAppState();
            renderRelationsList();
        }
        /** Une liste déroulante de la ligne « Clé du lien », avec son invite et ses options. */
        function v13ListeDeLaCle(relationId, suffixe, invite, valeurs, libelleDe) {
            const options = valeurs
                .map(
                    valeur =>
                        `<option value="${escapeHTML(valeur)}">${escapeHTML(libelleDe ? libelleDe(valeur) : valeur)}</option>`
                )
                .join('');
            return `<select id="v13-cle-${suffixe}-${relationId}" onchange="renderRelationsList()" class="border border-slate-200 p-1 rounded text-xs bg-white"><option value="">${escapeHTML(invite)}</option>${options}</select>`;
        }
        /** La ligne « Clé du lien » d'une relation : les conditions déjà posées, et de quoi en ajouter une. */
        function v13LigneCleDuLien(relation) {
            const nomDe = tableId => (state.tables[tableId] || {}).name || tableId;
            const colonnesDe = tableId => (state.tables[tableId] || {}).headers || [];
            const posees = v13ConditionsDeLaCle(relation)
                .map(
                    (condition, rang) =>
                        `<span class="v13-paire">+ ${escapeHTML(nomDe(condition.deTable))}.${escapeHTML(condition.deColonne)} = ${escapeHTML(nomDe(condition.versTable))}.${escapeHTML(condition.versColonne)}
                            <button onclick="v13RetirerDeLaCle('${relation.id}', ${rang})" title="Retirer cette condition de la clé">✕</button></span>`
                )
                .join('');
            const saisie = v13ConditionSaisie(relation.id);
            const toutesLesTables = Object.keys(state.tables);
            const ajout =
                v13ListeDeLaCle(
                    relation.id,
                    'table-contrainte',
                    '+ contraindre…',
                    [relation.sourceTable, relation.targetTable],
                    nomDe
                ) +
                v13ListeDeLaCle(relation.id, 'colonne-contrainte', 'colonne…', colonnesDe(saisie.deTable)) +
                '<span class="text-slate-400">=</span>' +
                v13ListeDeLaCle(relation.id, 'table-comparee', 'table…', toutesLesTables, nomDe) +
                v13ListeDeLaCle(relation.id, 'colonne-comparee', 'colonne…', colonnesDe(saisie.versTable)) +
                `<button onclick="v13AjouterALaCle('${relation.id}')" class="text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-100">+ Ajouter à la clé</button>`;
            return `<div class="v13-cle-lien flex items-center gap-2 mt-2 flex-wrap pl-1" data-rel="${escapeHTML(relation.id)}">
                <span class="text-[10px] uppercase font-bold text-slate-400" title="Les conditions qui s'ajoutent à la correspondance : sans elles, une ligne peut revenir plusieurs fois">Clé du lien</span>
                ${posees}${ajout}
            </div>`;
        }
        Studio.extend(
            'renderRelationsList',
            base =>
                function () {
                    const liste = el('relationsList');
                    // On met de côté ce qui est en cours de saisie : la fonction de base réécrit toute la liste.
                    if (liste)
                        liste.querySelectorAll('.v13-cle-lien select').forEach(champ => {
                            if (champ.value) v13SaisieDesCles[champ.id] = champ.value;
                            else delete v13SaisieDesCles[champ.id];
                        });
                    base();
                    if (!liste || !state.relations.length) return;
                    // Les lignes suivent l'ordre du périmètre affiché, comme dans la fonction de base.
                    const visibles = mcdVisibleIds();
                    const affichees = state.relations.filter(r => visibles.has(r.sourceTable) && visibles.has(r.targetTable));
                    if (liste.children.length !== affichees.length) return;
                    affichees.forEach((relation, rang) => {
                        const ligne = liste.children[rang];
                        if (ligne && ligne.insertAdjacentHTML)
                            ligne.insertAdjacentHTML('beforeend', v13LigneCleDuLien(relation));
                    });
                    Object.entries(v13SaisieDesCles).forEach(([identifiant, valeur]) => {
                        const champ = el(identifiant);
                        if (champ) champ.value = valeur;
                    });
                }
        );

        // ---- 3. Le contrôle : quelle table liée multiplie les lignes ? ----
        /**
         * Le SQL qui compte les lignes avec les « combien » premières jointures. Toujours en LEFT JOIN : on
         * mesure ce que la jointure ajoute, pas ce qu'une intersection retirerait — sans quoi une perte de
         * lignes masquerait un gain.
         */
        function v13SqlDeComptage(baseId, jointures, combien) {
            const clauses = jointures
                .slice(0, combien)
                .map(j => `LEFT JOIN ${sqlIdent(duckTableName(j.id))} ${j.alias} ON ${j.on}`);
            return `SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(baseId))} x0${clauses.length ? '\n  ' + clauses.join('\n  ') : ''}`;
        }
        /** En deçà de ce rapport, l'écart tient au hasard des données et ne mérite pas d'alerte. */
        const V13_SEUIL_DE_MULTIPLICATION = 1.01;
        /**
         * Le verdict d'une jointure. Le facteur est arrondi au centième : « 4 » se lit, « 4,0000001 » non. Une
         * jointure qui ne trouve rien laisse le compte inchangé — c'est un autre problème (les orphelins, que la
         * mesure du lien signale déjà) ; ici on ne parle que de multiplication.
         */
        function v13VerdictDeJointure(etape) {
            const facteur = etape.lignesAvant ? Math.round((100 * etape.lignesApres) / etape.lignesAvant) / 100 : 1;
            const multiplie = facteur > V13_SEUIL_DE_MULTIPLICATION;
            const avant = Number(etape.lignesAvant).toLocaleString('fr-FR');
            const apres = Number(etape.lignesApres).toLocaleString('fr-FR');
            return {
                nomTable: etape.nomTable,
                lignesAvant: etape.lignesAvant,
                lignesApres: etape.lignesApres,
                facteur,
                multiplie,
                phrase: multiplie
                    ? `« ${etape.nomTable} » multiplie les lignes : ${avant} → ${apres} (×${facteur.toLocaleString('fr-FR')}). Il manque sans doute une colonne à la clé de ce lien.`
                    : `« ${etape.nomTable} » n’ajoute aucune ligne : ${avant} ligne(s) avant comme après.`
            };
        }
        /** Le bilan de toutes les tables liées, et ce qu'il faut en retenir en une phrase. */
        function v13BilanDesJointures(etapes) {
            const jointures = (etapes || []).map(v13VerdictDeJointure);
            const fautives = jointures.filter(v => v.multiplie);
            if (!jointures.length)
                return { jointures, multiplie: false, phrase: 'Aucune table liée : rien ne peut multiplier les lignes.' };
            if (!fautives.length)
                return {
                    jointures,
                    multiplie: false,
                    phrase: 'Aucune table liée ne multiplie les lignes : le résultat compte ce qu’il annonce.'
                };
            const depart = Number(jointures[0].lignesAvant).toLocaleString('fr-FR');
            const total = Number(jointures[jointures.length - 1].lignesApres).toLocaleString('fr-FR');
            return {
                jointures,
                multiplie: true,
                phrase: `${fautives.length} table(s) liée(s) multiplient les lignes : ${depart} au départ, ${total} en sortie. Complétez la clé de ces liens dans le Modèle de données.`
            };
        }
        /** Mesure sur les données ce que chaque table liée fait au nombre de lignes. */
        async function v13MesurerLesJointures() {
            const spec = state.advExtract;
            if (!spec || !spec.baseId) return null;
            buildAdvSql(spec); // c'est lui qui planifie les jointures, mémorisées par la greffe ci-dessus
            const plan = v13State.dernierPlan;
            if (!plan || plan.baseId !== spec.baseId) return null;
            const { conn } = await getDB();
            const compter = async combien =>
                Number(arrowResultToObjects(await conn.query(v13SqlDeComptage(plan.baseId, plan.joins, combien)))[0].n);
            const etapes = [];
            let lignesAvant = await compter(0);
            for (let rang = 0; rang < plan.joins.length; rang++) {
                const lignesApres = await compter(rang + 1);
                const table = state.tables[plan.joins[rang].id];
                etapes.push({ nomTable: (table || {}).name || plan.joins[rang].id, lignesAvant, lignesApres });
                lignesAvant = lignesApres;
            }
            return v13BilanDesJointures(etapes);
        }
        /** Le rendu du bilan dans l'encadré prévu sous les actions de l'extraction. */
        function v13AfficherLeBilan(bilan) {
            const boite = el('v13-jointures');
            if (!boite) return;
            if (!bilan) {
                boite.innerHTML = '';
                return;
            }
            const details = bilan.jointures
                .map(j => `<p class="v13-jd ${j.multiplie ? 'fautive' : ''}">${escapeHTML(j.phrase)}</p>`)
                .join('');
            const conseil = bilan.multiplie
                ? `<p class="v13-jd">Une clé incomplète fait revenir la même ligne plusieurs fois : les totaux deviennent faux sans rien signaler. Ouvrez le Modèle de données, ligne « Clé du lien », et ajoutez la colonne qui manque — le groupe, la date, la version…</p>`
                : '';
            boite.innerHTML = `<div class="v13-jointures ${bilan.multiplie ? 'multiplie' : ''}">
                <p class="v13-jv">${bilan.multiplie ? '⚠️' : '✅'} ${escapeHTML(bilan.phrase)}</p>${details}${conseil}
            </div>`;
        }
        /** Le contrôle demandé explicitement : il rend son verdict même quand tout va bien, pour rassurer. */
        async function v13ControlerJointures() {
            const boite = el('v13-jointures');
            if (boite) boite.innerHTML = '<p class="text-xs text-slate-400">Mesure des tables liées…</p>';
            try {
                v13AfficherLeBilan(await v13MesurerLesJointures());
            } catch (e) {
                if (boite)
                    boite.innerHTML = `<p class="text-xs text-red-600">Contrôle impossible : ${escapeHTML(e.message)}</p>`;
            }
        }
        // Le contrôle discret qui accompagne l'aperçu : on prévient sans qu'on le demande. Un contrôle qui
        // échoue ne gâche jamais l'aperçu — il se tait.
        Studio.extend(
            'advPreview',
            base =>
                async function () {
                    const resultat = await base();
                    try {
                        const bilan = await v13MesurerLesJointures();
                        v13AfficherLeBilan(bilan && bilan.multiplie ? bilan : null);
                    } catch (e) {
                        v13AfficherLeBilan(null);
                    }
                    return resultat;
                }
        );
        // Le bouton, à côté du bilan qualité, et l'encadré qui reçoit le verdict.
        Studio.extend(
            'renderAdvExtract',
            base =>
                function () {
                    base();
                    const bilanQualite = document.querySelector('[onclick="advQuality()"]');
                    if (bilanQualite && !document.querySelector('[onclick="v13ControlerJointures()"]'))
                        bilanQualite.insertAdjacentHTML(
                            'afterend',
                            `<button onclick="v13ControlerJointures()" title="Vérifie sur les données qu'aucune table liée ne fait revenir les lignes plusieurs fois" class="text-sm bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50">🧮 Contrôler les tables liées</button>`
                        );
                    const qualite = el('adv-quality');
                    if (qualite && !el('v13-jointures'))
                        qualite.insertAdjacentHTML('beforebegin', '<div id="v13-jointures" class="mb-2"></div>');
                }
        );
