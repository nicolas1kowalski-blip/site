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
            const colonnes = statOptionsDesColonnes(table ? table.id : '');
            el('vizDim').innerHTML = colonnes;
            el('vizMeasure').innerHTML = colonnes;
            // Les deux axes en plus sont facultatifs : ils commencent à « aucun ».
            ['vizDim2', 'vizDim3'].forEach(nom => {
                const select = el(nom);
                if (select) select.innerHTML = '<option value="">— aucun —</option>' + colonnes;
            });
            // Les filtres portent sur les colonnes de la table : ils repartent à zéro
            // quand on change de table, sinon ils viseraient des colonnes absentes.
            statFiltres = [];
            statDessinerLesFiltres();
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
        // ---- Filtrer avant de compter ------------------------------------------
        // On peut restreindre les lignes AVANT le calcul : « seulement le site A »,
        // « seulement à partir de 2023 ». Mêmes opérateurs que partout ailleurs dans
        // l'application (QUAL_FILTER_OPS) et même traduction en SQL (qualCondSql).
        let statFiltres = [];
        function statAjouterFiltre() {
            statFiltres.push({ col: '', op: 'eq', val: '', conn: 'AND' });
            statDessinerLesFiltres();
        }
        function statDefinirFiltre(rang, champ, valeur) {
            if (!statFiltres[rang]) return;
            statFiltres[rang][champ] = valeur;
            // Changer de colonne ou d'opérateur change le champ de saisie proposé.
            if (champ === 'col' || champ === 'op') statDessinerLesFiltres();
        }
        function statSupprimerFiltre(rang) {
            statFiltres.splice(rang, 1);
            statDessinerLesFiltres();
        }
        function statDessinerLesFiltres() {
            const boite = el('statFiltres');
            if (!boite) return;
            const tId = el('vizBaseTable').value,
                table = state.tables[tId];
            const colonnes = table ? table.headers || [] : [];
            if (!statFiltres.length) {
                boite.innerHTML =
                    '<p class="text-xs text-slate-400 italic">Aucun filtre : toutes les lignes sont comptées.</p>';
                return;
            }
            boite.innerHTML = statFiltres
                .map((f, i) => {
                    const liaison =
                        i === 0
                            ? '<span class="text-xs font-bold text-slate-400 w-10 text-center shrink-0">Où</span>'
                            : `<select onchange="statDefinirFiltre(${i},'conn',this.value)" class="w-10 shrink-0 border rounded text-xs font-bold px-0.5 py-1 bg-white"><option value="AND" ${f.conn !== 'OR' ? 'selected' : ''}>ET</option><option value="OR" ${f.conn === 'OR' ? 'selected' : ''}>OU</option></select>`;
                    const attendUneValeur = !['empty', 'nempty'].includes(f.op);
                    const estUneDate = typeof covColIsDate === 'function' && covColIsDate(tId, f.col);
                    const saisie = estUneDate
                        ? `<input type="date" value="${escapeHTML(f.val || '')}" onchange="statDefinirFiltre(${i},'val',this.value)" class="w-36 shrink-0 border border-slate-300 rounded px-1 py-1 text-xs ${attendUneValeur ? '' : 'invisible'}">`
                        : `<input type="text" list="statfval-${i}" value="${escapeHTML(f.val || '')}" oninput="statDefinirFiltre(${i},'val',this.value)" placeholder="valeur" class="w-32 shrink-0 border border-slate-300 rounded px-1 py-1 text-xs ${attendUneValeur ? '' : 'invisible'}"><datalist id="statfval-${i}"></datalist>`;
                    return `<div class="flex items-center gap-1.5 mb-1.5">${liaison}
                        <select onchange="statDefinirFiltre(${i},'col',this.value)" class="flex-1 min-w-0 border border-slate-300 rounded px-1 py-1 text-xs bg-white"><option value="">— colonne —</option>${colonnes
                            .map(
                                h =>
                                    `<option value="${escapeHTML(h)}" ${f.col === h ? 'selected' : ''}>${escapeHTML(h)}</option>`
                            )
                            .join('')}</select>
                        <select onchange="statDefinirFiltre(${i},'op',this.value)" class="shrink-0 border border-slate-300 rounded px-0.5 py-1 text-xs bg-white">${QUAL_FILTER_OPS.map(
                            o => `<option value="${o.v}" ${o.v === f.op ? 'selected' : ''}>${o.t}</option>`
                        ).join('')}</select>
                        ${saisie}
                        <button onclick="statSupprimerFiltre(${i})" class="shrink-0 text-slate-300 hover:text-red-500 text-sm font-bold" title="Retirer ce filtre">✕</button>
                    </div>`;
                })
                .join('');
            // Les valeurs présentes dans la table sont proposées, comme ailleurs.
            if (table)
                statFiltres.forEach((f, i) => {
                    if (f.col && !(typeof covColIsDate === 'function' && covColIsDate(tId, f.col)))
                        tdFillDatalist('statfval-' + i, table.name, f.col);
                });
        }
        // Les filtres complets seulement : un filtre en cours de saisie ne doit pas
        // écarter des lignes par accident.
        function statFiltresComplets() {
            return statFiltres.filter(f => f.col && f.op && (['empty', 'nempty'].includes(f.op) || String(f.val || '').length));
        }
        function statSqlDesFiltres() {
            let sql = '';
            statFiltresComplets().forEach(f => {
                const condition = qualCondSql(f);
                if (!condition) return;
                sql = sql ? `(${sql}) ${f.conn === 'OR' ? 'OR' : 'AND'} ${condition}` : condition;
            });
            return sql;
        }
        function statPhraseDesFiltres() {
            const mots = {
                eq: '=',
                neq: '≠',
                contains: 'contient',
                ncontains: 'ne contient pas',
                starts: 'commence par',
                ends: 'finit par',
                empty: 'est vide',
                nempty: 'n’est pas vide',
                gt: '>',
                gte: '≥',
                lt: '<',
                lte: '≤'
            };
            return statFiltresComplets()
                .map(
                    (f, i) =>
                        (i ? (f.conn === 'OR' ? 'ou ' : 'et ') : '') + f.col + ' ' + (mots[f.op] || f.op) + ' ' + (f.val || '')
                )
                .join(' ')
                .trim();
        }

        // ---- Les axes de l'analyse ---------------------------------------------
        // On peut croiser jusqu'à TROIS axes sur la même table : l'axe principal
        // (les barres), un deuxième (les séries dans chaque barre) et un troisième
        // (un graphique par valeur). Tous viennent de la table analysée.
        const STAT_AXES = [
            { colonne: 'vizDim', periode: 'vizPeriode', role: 'principal' },
            { colonne: 'vizDim2', periode: 'vizPeriode2', role: 'séries' },
            { colonne: 'vizDim3', periode: 'vizPeriode3', role: 'graphiques' }
        ];
        // Au-delà, le dessin devient illisible : on montre les premières valeurs et
        // on dit franchement combien il en reste — le tableau, lui, les garde toutes.
        const STAT_MAX_SERIES = 8;
        const STAT_MAX_GRAPHIQUES = 6;

        // Les axes réellement demandés, dans l'ordre, avec leur colonne et période.
        function statAxesDemandes() {
            const axes = [];
            STAT_AXES.forEach(def => {
                const select = el(def.colonne);
                if (!select || !select.value) return;
                const choix = statColonneChoisie(select.value);
                if (!choix.colonne) return;
                const periodeElement = el(def.periode);
                axes.push({
                    tId: choix.tId,
                    colonne: choix.colonne,
                    periode: periodeElement ? periodeElement.value : '',
                    role: def.role
                });
            });
            return axes;
        }
        function statNomDeLAxe(axe) {
            return axe.periode ? STAT_PERIODES[axe.periode].toLowerCase() + ' de ' + axe.colonne : axe.colonne;
        }
        function statTitreDuCalcul(operation, mesure, axes) {
            const quoi =
                operation === 'count' ? 'Nombre de lignes' : (STAT_OPERATIONS[operation] || {}).libelle + ' de ' + mesure;
            return quoi + ' par ' + axes.map(statNomDeLAxe).join(' × ');
        }

        async function generateChart(bouton) {
            const axes = statAxesDemandes();
            if (!axes.length) return showError("Sélectionnez la colonne de l'axe.");
            // C'est la table du PREMIER axe que l'on analyse, même si la « source de
            // données » affichée en haut n'a pas encore été changée.
            const table = state.tables[axes[0].tId];
            if (!table) return showError('Sélectionnez la table à analyser.');
            // Sans jointure, croiser des colonnes de deux tables n'a pas de sens.
            const ailleurs = axes.find(a => a.tId !== axes[0].tId);
            if (ailleurs)
                return showError(
                    'Les axes doivent venir de la même table (' +
                        table.name +
                        ') : « ' +
                        ailleurs.colonne +
                        ' » vient d’ailleurs.'
                );
            const operation = el('vizAgg').value;
            const besoinDeColonne = (STAT_OPERATIONS[operation] || {}).colonne;
            const aMesurer = besoinDeColonne ? statColonneChoisie(el('vizMeasure').value) : { tId: axes[0].tId, colonne: '' };
            if (besoinDeColonne && !aMesurer.colonne) return showError('Sélectionnez la colonne à mesurer.');
            // L'ancien écran laissait choisir la mesure dans une AUTRE table, puis
            // la cherchait dans celle de l'axe : le calcul était faux sans le dire.
            if (besoinDeColonne && aMesurer.tId !== axes[0].tId)
                return showError('La colonne à mesurer doit venir de la même table que l’axe (' + table.name + ').');
            hideError();
            if (bouton) bouton.disabled = true;
            bgTaskStart('Calcul des statistiques');
            try {
                const { conn } = await getDB();
                const colonnesSql = axes.map((axe, rang) => `${statSqlDeLAxe(axe.colonne, axe.periode)} AS axe${rang}`);
                const ou = statSqlDesFiltres();
                const groupes = axes.map((axe, rang) => rang + 1).join(', ');
                const res = await conn.query(`SELECT ${colonnesSql.join(', ')},
                        ${statSqlDeLaMesure(operation, aMesurer.colonne)} AS valeur, COUNT(*)::BIGINT AS lignes
                    FROM ${sqlIdent(duckTableName(table.id))}${ou ? ' WHERE ' + ou : ''}
                    GROUP BY ${groupes} ORDER BY ${groupes}`);
                const lignes = arrowResultToObjects(res).map(r => ({
                    axes: axes.map((axe, rang) => String(r['axe' + rang])),
                    valeur: r.valeur === null || r.valeur === undefined ? null : Number(r.valeur),
                    lignes: Number(r.lignes)
                }));
                statDernierResultat = {
                    titre: statTitreDuCalcul(operation, aMesurer.colonne, axes),
                    tableau: table.name,
                    filtres: statPhraseDesFiltres(),
                    axes: axes,
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

        // ---- Mise en forme du résultat -----------------------------------------
        // Les valeurs d'un axe, rangées : dans l'ordre du temps pour une période,
        // de la plus fournie à la moins fournie sinon.
        function statValeursDeLAxe(lignes, rang, periode) {
            const poids = new Map();
            lignes.forEach(l => poids.set(l.axes[rang], (poids.get(l.axes[rang]) || 0) + l.lignes));
            const valeurs = [...poids.keys()];
            valeurs.sort((a, b) => (periode ? (a < b ? -1 : a > b ? 1 : 0) : poids.get(b) - poids.get(a)));
            return valeurs;
        }
        function statNombreLisible(v) {
            return v === null ? '—' : Number.isInteger(v) ? v.toLocaleString('fr-FR') : v.toFixed(2);
        }

        // ---- Le dessin ----------------------------------------------------------
        // Trois présentations possibles dès qu'il y a un 2e ou un 3e axe :
        //   « empile »   : tout dans un seul graphique, les valeurs du dernier axe
        //                  empilées les unes sur les autres à l'intérieur de la barre ;
        //   « groupe »   : tout dans un seul graphique, les barres côte à côte ;
        //   « facettes » : un graphique par valeur du 3e axe.
        const STAT_COULEURS = ['#4f46e5', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#0ea5e9', '#f43f5e', '#14b8a6'];
        // Les sous-barres d'une même barre gardent la teinte de leur barre, mais
        // vont du foncé au très clair. La transparence, essayée d'abord, ne se
        // voyait pas : deux segments voisins semblaient de la même couleur.
        const STAT_NUANCE_LA_PLUS_SOMBRE = -0.3; // vers le noir
        const STAT_NUANCE_LA_PLUS_CLAIRE = 0.7; // vers le blanc
        // Mélange deux couleurs « #rrggbb », part = 0 (la première) … 1 (la seconde).
        function statMelange(couleur, versQuoi, part) {
            const lire = (hex, i) => parseInt(hex.substr(1 + i * 2, 2), 16);
            const deuxChiffres = n =>
                Math.max(0, Math.min(255, Math.round(n)))
                    .toString(16)
                    .padStart(2, '0');
            return (
                '#' +
                [0, 1, 2].map(i => deuxChiffres(lire(couleur, i) + (lire(versQuoi, i) - lire(couleur, i)) * part)).join('')
            );
        }
        function statNuanceDe(teinte, rang, combien) {
            if (combien <= 1) return teinte;
            const position = rang / (combien - 1);
            const force = STAT_NUANCE_LA_PLUS_SOMBRE + position * (STAT_NUANCE_LA_PLUS_CLAIRE - STAT_NUANCE_LA_PLUS_SOMBRE);
            return force < 0 ? statMelange(teinte, '#000000', -force) : statMelange(teinte, '#ffffff', force);
        }
        function statPresentation() {
            const select = el('vizPresentation');
            return select && select.value ? select.value : 'empile';
        }
        function statValeurDe(lignes, abscisse, serie, sousSerie) {
            const trouvee = lignes.find(
                l =>
                    l.axes[0] === abscisse &&
                    (serie === null || l.axes[1] === serie) &&
                    (sousSerie === null || l.axes[2] === sousSerie)
            );
            return trouvee ? trouvee.valeur : null;
        }
        // Les séries dessinées, à plat : une par valeur du 2e axe, ou une par
        // croisement 2e × 3e axe quand tout tient dans un seul graphique.
        function statDonneesDuGraphique(lignes, resultat, abscisses, series, sousSeries) {
            if (!series)
                return {
                    labels: abscisses,
                    datasets: [
                        {
                            label: resultat.titre,
                            data: abscisses.map(a => statValeurDe(lignes, a, null, null)),
                            backgroundColor: abscisses.map((a, i) => STAT_COULEURS[i % STAT_COULEURS.length])
                        }
                    ]
                };
            if (!sousSeries)
                return {
                    labels: abscisses,
                    datasets: series.map((serie, i) => ({
                        label: serie,
                        data: abscisses.map(a => statValeurDe(lignes, a, serie, null)),
                        backgroundColor: STAT_COULEURS[i % STAT_COULEURS.length],
                        // Empiler : toutes les séries dans une seule barre par abscisse.
                        stack: statPresentation() === 'empile' ? 'tout' : undefined
                    }))
                };
            const empile = statPresentation() === 'empile';
            const datasets = [];
            series.forEach((serie, i) => {
                const teinte = STAT_COULEURS[i % STAT_COULEURS.length];
                sousSeries.forEach((sous, j) => {
                    datasets.push({
                        label: serie + ' · ' + sous,
                        data: abscisses.map(a => statValeurDe(lignes, a, serie, sous)),
                        backgroundColor: statNuanceDe(teinte, j, sousSeries.length),
                        // Un liseré blanc sépare nettement deux segments voisins.
                        borderColor: '#ffffff',
                        borderWidth: 1,
                        // Une pile par valeur du 2e axe : le 3e axe devient les
                        // sous-barres empilées À L'INTÉRIEUR de cette barre.
                        stack: empile ? serie : undefined
                    });
                });
            });
            return { labels: abscisses, datasets };
        }
        function statUnGraphique(canvas, donnees, titre) {
            const type = el('vizType').value;
            // Empiler n'a de sens que sur des barres : un camembert ne s'empile pas.
            const empile = type === 'bar' && donnees.datasets.some(d => d.stack);
            return new Chart(canvas.getContext('2d'), {
                type: type,
                data: donnees,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: empile ? { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } : undefined,
                    plugins: {
                        legend: { display: donnees.datasets.length > 1, labels: { boxWidth: 10, font: { size: 10 } } },
                        title: titre ? { display: true, text: titre, font: { size: 12, weight: 'bold' } } : undefined
                    }
                }
            });
        }
        // Les graphiques du 3e axe, rangés à côté du graphique principal.
        let statGraphiquesEnPlus = [];
        function statDessinerLesGraphiques(resultat, abscisses, series, graphiques) {
            if (currentChart) currentChart.destroy();
            currentChart = null;
            statGraphiquesEnPlus.forEach(g => {
                try {
                    g.destroy();
                } catch (e) {}
            });
            statGraphiquesEnPlus = [];
            const facettes = el('statFacettes');
            facettes.innerHTML = '';
            const principal = el('myChart').parentNode;
            // Un seul graphique : soit il n'y a pas de 3e axe, soit on a demandé à
            // tout voir ensemble (sous-barres empilées ou barres côte à côte).
            if (!graphiques || statPresentation() !== 'facettes') {
                principal.classList.remove('hidden');
                currentChart = statUnGraphique(
                    el('myChart'),
                    statDonneesDuGraphique(resultat.lignes, resultat, abscisses, series, graphiques),
                    null
                );
                return;
            }
            principal.classList.add('hidden');
            graphiques.forEach(valeur => {
                const sous = resultat.lignes.filter(l => l.axes[2] === valeur);
                const carte = document.createElement('div');
                carte.className = 'border border-slate-200 rounded-lg p-2 bg-white';
                carte.innerHTML = '<div class="h-[240px] relative"></div>';
                const canvas = document.createElement('canvas');
                carte.firstChild.appendChild(canvas);
                facettes.appendChild(carte);
                const compte = sous.reduce((somme, l) => somme + l.lignes, 0);
                statGraphiquesEnPlus.push(
                    statUnGraphique(
                        canvas,
                        statDonneesDuGraphique(sous, resultat, abscisses, series, null),
                        valeur + ' — ' + compte.toLocaleString('fr-FR') + ' ligne(s)'
                    )
                );
            });
        }

        function statAfficherLeResultat() {
            const resultat = statDernierResultat;
            if (!resultat) return;
            el('chartDisplayArea').classList.remove('hidden');

            const toutes = statValeursDeLAxe(resultat.lignes, 0, resultat.axes[0].periode);
            const abscisses = toutes.slice(0, STAT_MAX_BARRES);
            const laissees = [{ nom: statNomDeLAxe(resultat.axes[0]), reste: toutes.length - abscisses.length }];
            let series = null,
                graphiques = null;
            if (resultat.axes[1]) {
                const s = statValeursDeLAxe(resultat.lignes, 1, resultat.axes[1].periode);
                series = s.slice(0, STAT_MAX_SERIES);
                laissees.push({ nom: statNomDeLAxe(resultat.axes[1]), reste: s.length - series.length });
            }
            if (resultat.axes[2]) {
                const g = statValeursDeLAxe(resultat.lignes, 2, resultat.axes[2].periode);
                graphiques = g.slice(0, STAT_MAX_GRAPHIQUES);
                laissees.push({ nom: statNomDeLAxe(resultat.axes[2]), reste: g.length - graphiques.length });
            }

            // Sans la bibliothèque de graphiques (pas d'internet), on garde au moins
            // les chiffres : le tableau plus bas suffit à répondre à la question.
            if (typeof Chart === 'undefined') {
                el('myChart').parentNode.classList.add('hidden');
                el('statFacettes').innerHTML = '';
            } else {
                statDessinerLesGraphiques(resultat, abscisses, series, graphiques);
            }

            const nonDessinees = laissees.filter(x => x.reste > 0);
            el('statResume').innerHTML =
                `<b>${escapeHTML(resultat.titre)}</b> — ${escapeHTML(resultat.tableau)} · ` +
                `${resultat.lignes.length.toLocaleString('fr-FR')} croisement(s), ` +
                `${resultat.total.toLocaleString('fr-FR')} ligne(s) analysée(s)` +
                (resultat.filtres ? ` <b>où ${escapeHTML(resultat.filtres)}</b>.` : ' (table entière).') +
                (nonDessinees.length
                    ? ' <span class="text-amber-700">Le dessin se limite à ' +
                      nonDessinees
                          .map(x => x.reste.toLocaleString('fr-FR') + ' valeur(s) de « ' + escapeHTML(x.nom) + ' » en moins')
                          .join(', ') +
                      ' ; le tableau et l’export les gardent toutes.</span>'
                    : '');

            const entetes = resultat.axes
                .map(a => `<th class="text-left p-2 font-bold text-slate-600">${escapeHTML(statNomDeLAxe(a))}</th>`)
                .join('');
            el('statTableau').innerHTML = `<div class="max-h-72 overflow-auto border border-slate-200 rounded-lg">
                <table class="w-full text-sm"><thead class="bg-slate-50 sticky top-0"><tr>${entetes}
                    <th class="text-right p-2 font-bold text-slate-600">Résultat</th>
                    <th class="text-right p-2 font-bold text-slate-600">Lignes</th>
                </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">${resultat.lignes
                        .map(
                            l =>
                                '<tr>' +
                                l.axes.map(v => `<td class="p-2">${escapeHTML(v)}</td>`).join('') +
                                `<td class="p-2 text-right font-mono">${statNombreLisible(l.valeur)}</td>` +
                                `<td class="p-2 text-right text-slate-500">${l.lignes.toLocaleString('fr-FR')}</td></tr>`
                        )
                        .join('')}</tbody></table></div>`;
        }

        // Agrandir le graphique : on confie le travail au plein écran de l'application
        // quand il est là (V11 et au-delà), sinon on demande celui du navigateur.
        function statPleinEcran() {
            const cadre = el('statGraphes');
            if (!cadre) return;
            if (typeof v11Fs === 'function') {
                v11Fs('#statGraphes', (statDernierResultat && statDernierResultat.titre) || 'Statistiques');
                return;
            }
            if (cadre.requestFullscreen)
                cadre.requestFullscreen().catch(e => showError('Plein écran refusé : ' + ((e && e.message) || '')));
        }

        // Le tableau complet, pas seulement ce que les graphiques montrent.
        function statExporterCsv() {
            if (!statDernierResultat) return showError('Générez d’abord un graphique.');
            const guillemets = v => '"' + String(v === null ? '' : v).replace(/"/g, '""') + '"';
            const entetes = statDernierResultat.axes.map(statNomDeLAxe).concat(['Résultat', 'Lignes']);
            const csv = [entetes.map(guillemets).join(';')]
                .concat(statDernierResultat.lignes.map(l => l.axes.concat([l.valeur, l.lignes]).map(guillemets).join(';')))
                .join('\n');
            downloadTextFile('statistiques_' + statDernierResultat.tableau + '.csv', csv);
            showSuccess('Tableau exporté.');
        }
