        // ==========================================
        //  STEP 4: STATS BI
        // ==========================================
        // Statistiques simples sur UNE table : on choisit une colonne pour l'axe,
        // éventuellement un regroupement par période (année, trimestre, mois), et
        // une opération (nombre de lignes, somme, moyenne...). Le calcul est fait
        // par le moteur de données sur la TOTALITÉ de la table, pas sur un échantillon.

        // Les regroupements de période proposés pour l'axe.
        const STAT_PERIODES = {
            annee: 'Année',
            trimestre: 'Trimestre',
            mois: 'Mois'
        };
        // Les opérations proposées, et si elles ont besoin d'une colonne à mesurer.
        const STAT_OPERATIONS = {
            count: { libelle: 'Nombre de lignes', colonne: false },
            distinct: { libelle: 'Valeurs différentes', colonne: true },
            sum: { libelle: 'Somme', colonne: true },
            avg: { libelle: 'Moyenne', colonne: true },
            min: { libelle: 'Minimum', colonne: true },
            max: { libelle: 'Maximum', colonne: true }
        };
        // Au-delà, le graphique devient illisible : on affiche les premières valeurs
        // et on dit franchement combien il en reste.
        const STAT_MAX_BARRES = 30;
        // Le dernier calcul, gardé pour l'export CSV du tableau affiché.
        let statDernierResultat = null;

        function updateVizBaseTableSelect() {
            const vizBaseTableElement = el('vizBaseTable');
            vizBaseTableElement.innerHTML = tableOptionsHtml({ placeholder: 'Sélectionnez la table...' });
        }

        // Une colonne est désignée par « identifiant de table | nom de colonne ».
        // L'identifiant ne contient jamais de barre verticale : on coupe à la PREMIÈRE,
        // ce qui laisse tranquilles les colonnes dont le nom en contient une.
        function statColonneChoisie(valeur) {
            const texte = String(valeur || ''),
                barre = texte.indexOf('|');
            if (barre < 0) return { tId: el('vizBaseTable').value, colonne: texte };
            return { tId: texte.slice(0, barre), colonne: texte.slice(barre + 1) };
        }
        // Toutes les tables chargées sont proposées, celle de l'écran en tête :
        // on garde la liberté de prendre une colonne ailleurs sans changer d'écran.
        function statOptionsDesColonnes(tableEnTete) {
            const tables = Object.values(state.tables).filter(t => (t.headers || []).length);
            tables.sort((a, b) => (a.id === tableEnTete ? -1 : b.id === tableEnTete ? 1 : 0));
            return tables
                .map(
                    t =>
                        `<optgroup label="${escapeHTML(t.name)}">${(t.headers || [])
                            .map(h => `<option value="${escapeHTML(t.id + '|' + h)}">${escapeHTML(h)}</option>`)
                            .join('')}</optgroup>`
                )
                .join('');
        }
        function handleVizBaseTableChange() {
            // Même sans table choisie en haut, la configuration reste accessible :
            // les colonnes de toutes les tables chargées y sont proposées.
            const table = state.tables[el('vizBaseTable').value];
            // Le panneau d'accueil ne sert que tant qu'aucune source n'est choisie.
            const accueil = el('emptyStateViz');
            if (accueil) accueil.classList.toggle('hidden', !!table);
            el('vizElementsContainer').classList.remove('hidden');
            el('vizDim').innerHTML = statOptionsDesColonnes(table ? table.id : '');
            el('vizMeasure').innerHTML = statOptionsDesColonnes(table ? table.id : '');
            statProposerLaPeriode();
            toggleVizMeasure();
        }

        // L'utilisateur change l'axe : si la colonne vient d'une autre table, c'est
        // ELLE que l'on analyse, et on remet la « source de données » d'accord avec
        // ce que l'on voit. (Appelé sur le choix de l'utilisateur seulement : quand
        // c'est l'écran qui reconstruit la liste, la source ne doit pas bouger.)
        function statAxeChange() {
            const choix = statColonneChoisie(el('vizDim').value);
            const source = el('vizBaseTable');
            if (choix.tId && source.value !== choix.tId && state.tables[choix.tId]) {
                source.value = choix.tId;
                el('vizMeasure').innerHTML = statOptionsDesColonnes(choix.tId);
            }
            statProposerLaPeriode();
        }
        // Si la colonne d'axe ressemble à une date, on met le regroupement par
        // période en avant : c'est la statistique la plus souvent demandée.
        function statProposerLaPeriode() {
            const aide = el('vizDimAide');
            if (!aide) return;
            const choix = statColonneChoisie(el('vizDim').value);
            const estUneDate = typeof covColIsDate === 'function' && covColIsDate(choix.tId, choix.colonne);
            aide.textContent = estUneDate ? 'Colonne de type date : regroupez par année, trimestre ou mois.' : '';
        }

        function toggleVizMeasure() {
            const operation = STAT_OPERATIONS[el('vizAgg').value] || STAT_OPERATIONS.count;
            el('vizMeasure').disabled = !operation.colonne;
        }

        // ---- Le SQL de l'axe ----------------------------------------------------
        // Une date arrive souvent en texte, dans des formats variés, parfois avec
        // l'heure : on essaie les formats connus, puis l'horodatage.
        function statDateLisible(brut) {
            return `COALESCE(TRY_CAST(${tdNormExpr('date', brut)} AS DATE), CAST(TRY_CAST(${brut} AS TIMESTAMP) AS DATE))`;
        }
        function statSqlDeLAxe(colonne, periode) {
            const brut = `CAST(${sqlIdent(colonne)} AS VARCHAR)`;
            const date = statDateLisible(brut);
            if (periode === 'annee')
                // Dernier recours : une année 19xx/20xx écrite quelque part dans la valeur.
                return `COALESCE(CAST(YEAR(${date}) AS VARCHAR), NULLIF(regexp_extract(TRIM(${brut}), '((?:19|20)\\d\\d)', 1), ''), '(vide)')`;
            if (periode === 'trimestre')
                return `COALESCE(CAST(YEAR(${date}) AS VARCHAR) || '-T' || CAST(QUARTER(${date}) AS VARCHAR), '(vide)')`;
            if (periode === 'mois') return `COALESCE(strftime(${date}, '%Y-%m'), '(vide)')`;
            return `COALESCE(NULLIF(TRIM(${brut}), ''), '(vide)')`;
        }

        // ---- Le SQL de la mesure ------------------------------------------------
        function statSqlDeLaMesure(operation, colonne) {
            if (operation === 'count' || !colonne) return 'COUNT(*)::BIGINT';
            const brut = `CAST(${sqlIdent(colonne)} AS VARCHAR)`;
            if (operation === 'distinct') return `COUNT(DISTINCT NULLIF(TRIM(${brut}), ''))::BIGINT`;
            // Les nombres arrivent parfois avec une virgule décimale ou des espaces.
            const nombre = `TRY_CAST(${tdNormExpr('dec', brut)} AS DOUBLE)`;
            if (operation === 'sum') return `SUM(${nombre})`;
            if (operation === 'avg') return `AVG(${nombre})`;
            if (operation === 'min') return `MIN(${nombre})`;
            if (operation === 'max') return `MAX(${nombre})`;
            return 'COUNT(*)::BIGINT';
        }

        function statTitreDuCalcul(operation, mesure, axe, periode) {
            const quoi =
                operation === 'count' ? 'Nombre de lignes' : (STAT_OPERATIONS[operation] || {}).libelle + ' de ' + mesure;
            return quoi + ' par ' + (periode ? STAT_PERIODES[periode].toLowerCase() + ' de ' : '') + axe;
        }

        async function generateChart(bouton) {
            const surLAxe = statColonneChoisie(el('vizDim').value);
            if (!surLAxe.colonne) return showError("Sélectionnez la colonne de l'axe.");
            // C'est la table de l'AXE que l'on analyse, même si la « source de
            // données » affichée en haut n'a pas encore été changée.
            const table = state.tables[surLAxe.tId];
            if (!table) return showError('Sélectionnez la table à analyser.');
            const periode = el('vizPeriode') ? el('vizPeriode').value : '';
            const operation = el('vizAgg').value;
            const besoinDeColonne = (STAT_OPERATIONS[operation] || {}).colonne;
            const aMesurer = besoinDeColonne ? statColonneChoisie(el('vizMeasure').value) : { tId: surLAxe.tId, colonne: '' };
            if (besoinDeColonne && !aMesurer.colonne) return showError('Sélectionnez la colonne à mesurer.');
            // L'ancien écran laissait choisir la mesure dans une AUTRE table, puis
            // la cherchait dans celle de l'axe : le calcul était faux sans le dire.
            if (besoinDeColonne && aMesurer.tId !== surLAxe.tId)
                return showError('La colonne à mesurer doit venir de la même table que l’axe (' + table.name + ').');
            const axe = surLAxe.colonne,
                mesure = aMesurer.colonne;
            hideError();
            if (bouton) bouton.disabled = true;
            bgTaskStart('Calcul des statistiques');
            try {
                const { conn } = await getDB();
                const sqlAxe = statSqlDeLAxe(axe, periode),
                    sqlMesure = statSqlDeLaMesure(operation, mesure);
                // Les périodes se lisent dans l'ordre du temps ; le reste, du plus
                // fréquent au moins fréquent.
                const tri = periode ? 'axe ASC' : 'valeur DESC NULLS LAST';
                const res = await conn.query(`SELECT ${sqlAxe} AS axe, ${sqlMesure} AS valeur, COUNT(*)::BIGINT AS lignes
                    FROM ${sqlIdent(duckTableName(table.id))} GROUP BY 1 ORDER BY ${tri}`);
                const lignes = arrowResultToObjects(res).map(r => ({
                    axe: String(r.axe),
                    valeur: r.valeur === null || r.valeur === undefined ? null : Number(r.valeur),
                    lignes: Number(r.lignes)
                }));
                statDernierResultat = {
                    titre: statTitreDuCalcul(operation, mesure, axe, periode),
                    tableau: table.name,
                    lignes: lignes,
                    total: lignes.reduce((somme, l) => somme + l.lignes, 0)
                };
                statAfficherLeResultat();
            } catch (e) {
                showError('Calcul impossible : ' + e.message);
            } finally {
                bgTaskEnd();
                if (bouton) bouton.disabled = false;
            }
        }

        function statDessinerLeGraphique(montrees, titre) {
            if (currentChart) currentChart.destroy();
            currentChart = new Chart(el('myChart').getContext('2d'), {
                type: el('vizType').value,
                data: {
                    labels: montrees.map(l => l.axe),
                    datasets: [
                        {
                            label: titre,
                            data: montrees.map(l => l.valeur),
                            backgroundColor: [
                                '#4f46e5',
                                '#10b981',
                                '#f59e0b',
                                '#8b5cf6',
                                '#ec4899',
                                '#0ea5e9',
                                '#f43f5e',
                                '#10b981',
                                '#14b8a6',
                                '#f97316'
                            ]
                        }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        function statAfficherLeResultat() {
            const resultat = statDernierResultat;
            if (!resultat) return;
            el('chartDisplayArea').classList.remove('hidden');
            const montrees = resultat.lignes.slice(0, STAT_MAX_BARRES);
            const reste = resultat.lignes.length - montrees.length;

            // Sans la bibliothèque de graphiques (pas d'internet), on garde au moins
            // les chiffres : le tableau plus bas suffit à répondre à la question.
            if (typeof Chart === 'undefined') {
                el('myChart').parentNode.classList.add('hidden');
            } else {
                el('myChart').parentNode.classList.remove('hidden');
                statDessinerLeGraphique(montrees, resultat.titre);
            }

            const nombre = v => (v === null ? '—' : Number.isInteger(v) ? v.toLocaleString('fr-FR') : v.toFixed(2));
            el('statResume').innerHTML =
                `<b>${escapeHTML(resultat.titre)}</b> — ${escapeHTML(resultat.tableau)} · ` +
                `${resultat.lignes.length.toLocaleString('fr-FR')} valeur(s) sur l'axe, ` +
                `${resultat.total.toLocaleString('fr-FR')} ligne(s) analysée(s) (table entière).` +
                (reste > 0
                    ? ` <span class="text-amber-700">Le graphique montre les ${STAT_MAX_BARRES} premières ; ${reste.toLocaleString('fr-FR')} autre(s) valeur(s) sont dans le tableau et dans l'export.</span>`
                    : '');
            el('statTableau').innerHTML = `<div class="max-h-72 overflow-auto border border-slate-200 rounded-lg">
                <table class="w-full text-sm"><thead class="bg-slate-50 sticky top-0"><tr>
                    <th class="text-left p-2 font-bold text-slate-600">Valeur</th>
                    <th class="text-right p-2 font-bold text-slate-600">Résultat</th>
                    <th class="text-right p-2 font-bold text-slate-600">Lignes</th>
                </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">${resultat.lignes
                    .map(
                        l =>
                            `<tr><td class="p-2">${escapeHTML(l.axe)}</td><td class="p-2 text-right font-mono">${nombre(l.valeur)}</td><td class="p-2 text-right text-slate-500">${l.lignes.toLocaleString('fr-FR')}</td>
                                </tr>`
                    )
                    .join('')}</tbody></table></div>`;
        }

        // Le tableau complet, pas seulement ce que le graphique montre.
        function statExporterCsv() {
            if (!statDernierResultat) return showError('Générez d’abord un graphique.');
            const guillemets = v => '"' + String(v === null ? '' : v).replace(/"/g, '""') + '"';
            const csv = [['Valeur', 'Résultat', 'Lignes'].join(';')]
                .concat(
                    statDernierResultat.lignes.map(l =>
                        [guillemets(l.axe), guillemets(l.valeur), guillemets(l.lignes)].join(';')
                    )
                )
                .join('\n');
            downloadTextFile('statistiques_' + statDernierResultat.tableau + '.csv', csv);
            showSuccess('Tableau exporté.');
        }
