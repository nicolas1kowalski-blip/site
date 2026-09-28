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

        // La table choisie commande tout l'écran : on ne propose que SES colonnes,
        // pour que l'on ne puisse pas mélanger deux tables sans s'en rendre compte.
        function handleVizBaseTableChange() {
            const table = state.tables[el('vizBaseTable').value];
            const boite = el('vizElementsContainer');
            if (!table) {
                boite.classList.add('hidden');
                return;
            }
            boite.classList.remove('hidden');
            const colonnes = (table.headers || [])
                .map(h => `<option value="${escapeHTML(h)}">${escapeHTML(h)}</option>`)
                .join('');
            el('vizDim').innerHTML = colonnes;
            el('vizMeasure').innerHTML = colonnes;
            statProposerLaPeriode();
            toggleVizMeasure();
        }

        // Si la colonne d'axe ressemble à une date, on met le regroupement par année
        // en avant : c'est la statistique la plus souvent demandée.
        function statProposerLaPeriode() {
            const aide = el('vizDimAide');
            if (!aide) return;
            const tId = el('vizBaseTable').value,
                colonne = el('vizDim').value;
            const estUneDate = typeof covColIsDate === 'function' && covColIsDate(tId, colonne);
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
            const table = state.tables[el('vizBaseTable').value];
            if (!table) return showError('Sélectionnez la table à analyser.');
            const axe = el('vizDim').value;
            if (!axe) return showError("Sélectionnez la colonne de l'axe.");
            const periode = el('vizPeriode') ? el('vizPeriode').value : '';
            const operation = el('vizAgg').value;
            const besoinDeColonne = (STAT_OPERATIONS[operation] || {}).colonne;
            const mesure = besoinDeColonne ? el('vizMeasure').value : '';
            if (besoinDeColonne && !mesure) return showError('Sélectionnez la colonne à mesurer.');
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

        function statAfficherLeResultat() {
            const resultat = statDernierResultat;
            if (!resultat) return;
            el('chartDisplayArea').classList.remove('hidden');
            const montrees = resultat.lignes.slice(0, STAT_MAX_BARRES);
            const reste = resultat.lignes.length - montrees.length;

            if (currentChart) currentChart.destroy();
            currentChart = new Chart(el('myChart').getContext('2d'), {
                type: el('vizType').value,
                data: {
                    labels: montrees.map(l => l.axe),
                    datasets: [
                        {
                            label: resultat.titre,
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
