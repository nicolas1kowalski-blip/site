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

        /** Les paires qui s'ajoutent à la clé d'un lien, nettoyées de ce qui n'existe plus dans les tables. */
        function v13PairesDeLaCle(relation) {
            const colonnesDe = tableId => (state.tables[tableId] || {}).headers || [];
            return (relation && Array.isArray(relation.extraCols) ? relation.extraCols : []).filter(
                paire =>
                    paire &&
                    colonnesDe(relation.sourceTable).includes(paire.sourceCol) &&
                    colonnesDe(relation.targetTable).includes(paire.targetCol)
            );
        }
        /** Au-delà, la clé n'est plus lisible et le lien mérite d'être repensé. */
        const V13_PAIRES_MAXIMUM = 6;

        // ---- 1. Greffe sur le moteur : les conditions supplémentaires de la jointure ----
        // La fonction de base a posé une condition unique « x1.colonne = x0.colonne ». On lui ajoute les autres
        // colonnes de la clé, du bon côté : l'alias de départ se lit dans la condition déjà écrite.
        const V13_MOTIF_ALIAS_DEPART = /=\s*UPPER\(TRIM\(CAST\((x\d+)\./;
        /** Normalisation identique à celle du moteur : casse et espaces ignorés des deux côtés. */
        function v13ComparaisonNormalisee(gauche, droite) {
            return `UPPER(TRIM(CAST(${gauche} AS VARCHAR))) = UPPER(TRIM(CAST(${droite} AS VARCHAR)))`;
        }
        /** La condition complète d'une jointure : la colonne du lien, puis les colonnes ajoutées à sa clé. */
        function v13ConditionDeJointure(jointure) {
            const paires = v13PairesDeLaCle(jointure.rel);
            if (!paires.length) return jointure.on;
            const aliasDepart = (String(jointure.on).match(V13_MOTIF_ALIAS_DEPART) || [])[1];
            if (!aliasDepart) return jointure.on;
            const jointeEstLaSource = jointure.rel.sourceTable === jointure.id;
            const enPlus = paires.map(paire => {
                const colonneJointe = jointeEstLaSource ? paire.sourceCol : paire.targetCol;
                const colonneDepart = jointeEstLaSource ? paire.targetCol : paire.sourceCol;
                return v13ComparaisonNormalisee(
                    jointure.alias + '.' + sqlIdent(colonneJointe),
                    aliasDepart + '.' + sqlIdent(colonneDepart)
                );
            });
            return [jointure.on].concat(enPlus).join(' AND ');
        }
        Studio.extend(
            'advPlanJoins',
            base =>
                function (baseId, needs) {
                    const plan = base(baseId, needs);
                    if (plan && plan.joins) {
                        plan.joins.forEach(jointure => (jointure.on = v13ConditionDeJointure(jointure)));
                        // Mémorisé pour le contrôle : ce sont exactement les jointures que l'extraction va poser.
                        v13State.dernierPlan = { baseId, joins: plan.joins.slice() };
                    }
                    return plan;
                }
        );

        // ---- 2. Écran Modèle de données : la colonne « Clé du lien » ----
        /** Ajoute au lien la paire choisie dans les deux listes, si elle n'y est pas déjà. */
        function v13AjouterALaCle(relationId) {
            const relation = (state.relations || []).find(r => r.id === relationId);
            const listeSource = el('v13-cle-source-' + relationId);
            const listeCible = el('v13-cle-cible-' + relationId);
            if (!relation || !listeSource || !listeCible || !listeSource.value || !listeCible.value) return;
            relation.extraCols = Array.isArray(relation.extraCols) ? relation.extraCols : [];
            if (relation.extraCols.length >= V13_PAIRES_MAXIMUM)
                return showError(`Une clé de lien ne peut pas dépasser ${V13_PAIRES_MAXIMUM} colonnes en plus.`);
            if (relation.extraCols.some(p => p.sourceCol === listeSource.value && p.targetCol === listeCible.value)) return;
            relation.extraCols.push({ sourceCol: listeSource.value, targetCol: listeCible.value });
            persistAppState();
            renderRelationsList();
        }
        /** Retire la paire de rang donné de la clé du lien. */
        function v13RetirerDeLaCle(relationId, rang) {
            const relation = (state.relations || []).find(r => r.id === relationId);
            if (!relation || !Array.isArray(relation.extraCols)) return;
            relation.extraCols.splice(rang, 1);
            persistAppState();
            renderRelationsList();
        }
        /** La ligne « Clé du lien » d'une relation : les paires déjà posées, et de quoi en ajouter une. */
        function v13LigneCleDuLien(relation) {
            const options = tableId =>
                ((state.tables[tableId] || {}).headers || [])
                    .map(colonne => `<option value="${escapeHTML(colonne)}">${escapeHTML(colonne)}</option>`)
                    .join('');
            const posees = v13PairesDeLaCle(relation)
                .map(
                    (paire, rang) =>
                        `<span class="v13-paire">+ ${escapeHTML(paire.sourceCol)} = ${escapeHTML(paire.targetCol)}
                            <button onclick="v13RetirerDeLaCle('${relation.id}', ${rang})" title="Retirer cette colonne de la clé">✕</button></span>`
                )
                .join('');
            const colonnesDisponibles =
                (state.tables[relation.sourceTable] || {}).headers && (state.tables[relation.targetTable] || {}).headers;
            const ajout = colonnesDisponibles
                ? `<select id="v13-cle-source-${relation.id}" class="border border-slate-200 p-1 rounded text-xs bg-white"><option value="">colonne de gauche…</option>${options(relation.sourceTable)}</select>
                   <span class="text-slate-400">=</span>
                   <select id="v13-cle-cible-${relation.id}" class="border border-slate-200 p-1 rounded text-xs bg-white"><option value="">colonne de droite…</option>${options(relation.targetTable)}</select>
                   <button onclick="v13AjouterALaCle('${relation.id}')" class="text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-100">+ Ajouter à la clé</button>`
                : '<span class="text-[11px] text-slate-300 italic">choisissez les deux tables pour compléter la clé</span>';
            return `<div class="v13-cle-lien flex items-center gap-2 mt-2 flex-wrap pl-1" data-rel="${escapeHTML(relation.id)}">
                <span class="text-[10px] uppercase font-bold text-slate-400" title="Les colonnes qui s'ajoutent à la correspondance : sans elles, une ligne peut revenir plusieurs fois">Clé du lien</span>
                ${posees}${ajout}
            </div>`;
        }
        Studio.extend(
            'renderRelationsList',
            base =>
                function () {
                    base();
                    const liste = el('relationsList');
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
