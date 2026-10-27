        // ==========================================
        //  STEP 7: COMPARATEUR
        // ==========================================
        function handleCompTableChange(side) {
            if (!compState.keys.length) compState.keys.push({ id: generateId(), colA: '', colB: '' });
            renderCompKeys();
            renderCompMappings();
        }

        // ---- V6.19 : clé COMPOSITE — autant de couples de colonnes (A ↔ B) que nécessaire ----
        function addCompKey() {
            compState.keys.push({ id: generateId(), colA: '', colB: '' });
            renderCompKeys();
        }
        function removeCompKey(id) {
            compState.keys = compState.keys.filter(k => k.id !== id);
            if (!compState.keys.length) compState.keys.push({ id: generateId(), colA: '', colB: '' });
            renderCompKeys();
        }
        function updateCompKey(id, side, val) {
            const k = compState.keys.find(x => x.id === id);
            if (!k) return;
            if (side === 'A') {
                k.colA = val;
                // Confort : on propose d'emblée la colonne de même nom côté B si elle existe.
                const tB = state.tables[el('compTableB').value];
                if (val && !k.colB && tB) {
                    const header = tB.headers.find(h => normColName(h) === normColName(val));
                    if (header) k.colB = header;
                }
            } else k.colB = val;
            renderCompKeys();
        }
        function compKeyParts() {
            return (compState.keys || []).filter(k => k.colA && k.colB);
        }
        // Une mesure affichée ne vaut que pour la clé et les réglages qui l'ont produite : dès que l'un
        // d'eux change, on efface plutôt que de laisser lire un chiffre périmé.
        function comparisonOublierLaVerification() {
            const zone = el('compKeyCheck');
            if (zone) zone.innerHTML = '';
        }

        function renderCompKeys() {
            comparisonOublierLaVerification();
            const area = el('compKeysArea');
            if (!area) return;
            const tA = state.tables[el('compTableA').value],
                tB = state.tables[el('compTableB').value];
            const opts = (t, cur, lbl) =>
                `<option value="">${lbl}</option>` +
                (t
                    ? t.headers
                          .map(h => `<option value="${escapeHTML(h)}" ${h === cur ? 'selected' : ''}>${escapeHTML(h)}</option>`)
                          .join('')
                    : '');
            if (!compState.keys.length) compState.keys.push({ id: generateId(), colA: '', colB: '' });
            area.innerHTML = compState.keys
                .map(
                    (k, i) => `
                <div class="flex items-center gap-3 bg-amber-50/40 p-2 border border-amber-200 rounded">
                    <span class="text-[10px] font-black text-amber-700 w-6 text-center">${i + 1}</span>
                    <div class="w-5/12"><select class="w-full border border-slate-300 p-2 text-sm rounded bg-white" onchange="updateCompKey('${k.id}', 'A', this.value)">${opts(tA, k.colA, 'Colonne clé Fichier A...')}</select></div>
                    <div class="w-2/12 flex justify-center text-amber-500 font-bold">↔</div>
                    <div class="w-5/12"><select class="w-full border border-slate-300 p-2 text-sm rounded bg-white" onchange="updateCompKey('${k.id}', 'B', this.value)">${opts(tB, k.colB, 'Colonne clé Fichier B...')}</select></div>
                    <button onclick="removeCompKey('${k.id}')" class="text-red-500 hover:text-red-700 ml-2" title="Retirer cette colonne de la clé">✕</button>
                </div>`
                )
                .join('');
            const parts = compKeyParts();
            area.insertAdjacentHTML(
                'beforeend',
                parts.length > 1
                    ? `<p class="text-[11px] text-amber-700 font-bold">Clé composite sur ${parts.length} colonnes : ${escapeHTML(parts.map(k => k.colA).join(' + '))} ↔ ${escapeHTML(parts.map(k => k.colB).join(' + '))}</p>`
                    : parts.length
                      ? `<p class="text-[11px] text-slate-400">Clé simple : ${escapeHTML(parts[0].colA)} ↔ ${escapeHTML(parts[0].colB)}.</p>`
                      : ''
            );
        }

        function addCompMapping() {
            compState.mappings.push({ id: generateId(), colA: '', colB: '' });
            renderCompMappings();
        }
        function removeCompMapping(id) {
            compState.mappings = compState.mappings.filter(m => m.id !== id);
            renderCompMappings();
        }
        function updateCompMapping(id, side, val) {
            const mapping = compState.mappings.find(x => x.id === id);
            if (mapping) {
                if (side === 'A') mapping.colA = val;
                else mapping.colB = val;
            }
        }

        function renderCompMappings() {
            const area = el('compMappingsArea');
            const tIdA = el('compTableA').value;
            const tIdB = el('compTableB').value;
            let optsA = '<option value="">Colonne Fichier A...</option>';
            if (tIdA && state.tables[tIdA])
                optsA += state.tables[tIdA].headers
                    .map(h => `<option value="${escapeHTML(h)}">${escapeHTML(h)}</option>`)
                    .join('');
            let optsB = '<option value="">Colonne Fichier B...</option>';
            if (tIdB && state.tables[tIdB])
                optsB += state.tables[tIdB].headers
                    .map(h => `<option value="${escapeHTML(h)}">${escapeHTML(h)}</option>`)
                    .join('');

            if (compState.mappings.length === 0) {
                area.innerHTML =
                    '<p class="text-sm text-slate-400 italic">Aucune correspondance. Cliquez sur Ajouter pour commencer le mapping.</p>';
                return;
            }

            let html = '';
            compState.mappings.forEach(m => {
                html += `
                <div class="flex items-center gap-3 bg-slate-50 p-2 border border-slate-200 rounded">
                    <div class="w-5/12"><select class="w-full border border-slate-300 p-2 text-sm rounded focus:ring-indigo-500" onchange="updateCompMapping('${m.id}', 'A', this.value)">${optsA.replace(`value="${m.colA}"`, `value="${m.colA}" selected`)}</select></div>
                    <div class="w-2/12 flex justify-center text-slate-400"><i data-lucide="arrow-right-left" class="w-4 h-4"></i></div>
                    <div class="w-5/12"><select class="w-full border border-slate-300 p-2 text-sm rounded focus:ring-emerald-500" onchange="updateCompMapping('${m.id}', 'B', this.value)">${optsB.replace(`value="${m.colB}"`, `value="${m.colB}" selected`)}</select></div>
                    <button onclick="removeCompMapping('${m.id}')" class="text-red-500 hover:text-red-700 ml-2"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                </div>`;
            });
            area.innerHTML = html;
            lucide.createIcons();
        }

        // Normalise une colonne pour la comparaison : COALESCE(...,'') pour une valeur (une valeur NULL
        // compte comme "vide" quels que soient les réglages), NULLIF(...,'') pour une clé de jointure
        // (une clé vide ne doit jamais matcher une autre clé vide, exactement comme avant).
        function comparisonNormExpr(alias, col, ignoreSpace, ignoreCase, forKey) {
            let expr = `CAST(${alias ? alias + '.' : ''}${sqlIdent(col)} AS VARCHAR)`;
            if (ignoreSpace) expr = `TRIM(${expr})`;
            if (ignoreCase) expr = `LOWER(${expr})`;
            return forKey ? `NULLIF(${expr}, '')` : `COALESCE(${expr}, '')`;
        }

        // Clé composite : les parties normalisées sont concaténées avec un séparateur qui ne peut pas
        // figurer dans une donnée (chr(31), séparateur d'unité). Si UNE partie est vide, la clé entière
        // est nulle et la ligne est écartée — comme pour une clé simple.
        function comparisonCleCompositeSql(keyParts, side, ignoreSpace, ignoreCase) {
            const parties = keyParts.map(couple =>
                comparisonNormExpr('', side === 'A' ? couple.colA : couple.colB, ignoreSpace, ignoreCase, true)
            );
            if (parties.length === 1) return parties[0];
            const auMoinsUneVide = parties.map(partie => `${partie} IS NULL`).join(' OR ');
            return `CASE WHEN ${auMoinsUneVide} THEN NULL ELSE ${parties.join(' || chr(31) || ')} END`;
        }

        // ================= UNE CLÉ N'EST PAS UNE LIGNE =================
        // Deux fichiers de 80 000 lignes peuvent produire un rapport de 962 410 lignes, et ce n'est pas
        // un bug du comptage : c'est la jointure. Une clé présente 5 fois d'un côté et 3 fois de l'autre
        // produit 5 × 3 = 15 appariements. Tant qu'on ne mesure pas la répétition des clés, ce chiffre
        // reste inexplicable. On la mesure donc, toujours, et on l'écrit en clair.

        // Pour un fichier et une expression de clé : combien de lignes au total, combien portent une clé,
        // combien de clés DISTINCTES, combien de ces clés reviennent plusieurs fois, et jusqu'à combien
        // de fois. Un seul passage sur la donnée.
        function comparisonMesureDesClesSql(nomDeLaTableDuckDb, expressionDeLaCle) {
            return `
                WITH cles AS (SELECT ${expressionDeLaCle} AS cle FROM ${nomDeLaTableDuckDb}),
                     regroupees AS (SELECT cle, COUNT(*) AS occurrences FROM cles WHERE cle IS NOT NULL GROUP BY 1)
                SELECT
                    (SELECT COUNT(*) FROM cles)::BIGINT AS lignes_du_fichier,
                    (SELECT COALESCE(SUM(occurrences), 0) FROM regroupees)::BIGINT AS lignes_avec_une_cle,
                    (SELECT COUNT(*) FROM regroupees)::BIGINT AS cles_distinctes,
                    (SELECT COALESCE(SUM(CASE WHEN occurrences > 1 THEN 1 ELSE 0 END), 0) FROM regroupees)::BIGINT AS cles_repetees,
                    (SELECT COALESCE(MAX(occurrences), 0) FROM regroupees)::BIGINT AS occurrences_maximum
            `;
        }

        // Les mêmes chiffres, lus dans le résultat du moteur et nommés en clair.
        async function comparisonMesurerLesCles(connexion, nomDeLaTableDuckDb, expressionDeLaCle) {
            const resultat = await connexion.query(comparisonMesureDesClesSql(nomDeLaTableDuckDb, expressionDeLaCle));
            const ligne = arrowResultToObjects(resultat)[0] || {};
            return {
                lignesDuFichier: Number(ligne.lignes_du_fichier || 0),
                lignesAvecUneCle: Number(ligne.lignes_avec_une_cle || 0),
                clesDistinctes: Number(ligne.cles_distinctes || 0),
                clesRepetees: Number(ligne.cles_repetees || 0),
                occurrencesMaximum: Number(ligne.occurrences_maximum || 0)
            };
        }

        // Une clé est unique quand aucune de ses valeurs ne revient deux fois. C'est la condition pour
        // comparer des VALEURS ligne à ligne : sans elle, on ne sait pas quelle ligne comparer à quelle
        // autre.
        function comparisonCleEstUnique(mesure) {
            return !!mesure && mesure.clesRepetees === 0;
        }

        // « CID_taches.csv : 80 000 lignes · 65 849 clés distinctes · dont 9 212 présentes plusieurs fois
        //   (jusqu'à 12 fois) »
        function comparisonPhraseDUnFichier(nomDuFichier, mesure) {
            const enClair = valeur => Number(valeur || 0).toLocaleString('fr-FR');
            const morceaux = [`<strong>${escapeHTML(nomDuFichier)}</strong> : ${enClair(mesure.lignesDuFichier)} ligne(s)`];
            const sansCle = mesure.lignesDuFichier - mesure.lignesAvecUneCle;
            if (sansCle > 0) morceaux.push(`${enClair(sansCle)} écartée(s), clé vide`);
            morceaux.push(`${enClair(mesure.clesDistinctes)} clé(s) distincte(s)`);
            if (mesure.clesRepetees > 0)
                morceaux.push(
                    `dont ${enClair(mesure.clesRepetees)} présente(s) plusieurs fois (jusqu'à ${enClair(mesure.occurrencesMaximum)} fois)`
                );
            return morceaux.join(' · ');
        }

        // Le verdict : la clé désigne-t-elle UNE ligne de chaque côté ? Sinon, on dit combien de lignes
        // une seule clé peut produire en se faisant apparier, pour que le total du rapport ne soit jamais
        // une surprise.
        function comparisonVerdictDesClesHtml(mesureA, mesureB) {
            if (comparisonCleEstUnique(mesureA) && comparisonCleEstUnique(mesureB))
                return '<div class="text-xs text-emerald-700 font-bold">✔ Clé unique des deux côtés : une clé désigne bien une seule ligne de chaque fichier.</div>';
            const cotes = [];
            if (!comparisonCleEstUnique(mesureA)) cotes.push(`jusqu'à ${mesureA.occurrencesMaximum} fois dans A`);
            if (!comparisonCleEstUnique(mesureB)) cotes.push(`jusqu'à ${mesureB.occurrencesMaximum} fois dans B`);
            const appariements = Math.max(1, mesureA.occurrencesMaximum) * Math.max(1, mesureB.occurrencesMaximum);
            return `<div class="text-xs text-amber-700 font-bold">⚠ La clé n'est pas unique : une même clé revient ${cotes.join(' et ')}.</div>
                    <div class="text-[11px] text-amber-700">Comparer des <strong>valeurs</strong> apparie chaque ligne de A avec chaque ligne de B portant la même clé : une seule clé peut produire jusqu'à ${Number(appariements).toLocaleString('fr-FR')} ligne(s) de rapport. Ajoutez une colonne à la clé jusqu'à ce qu'elle soit unique. Pour les <strong>écarts de clé</strong>, en revanche, rien à craindre : chaque clé n'est comptée qu'une fois.</div>`;
        }

        // Le bilan complet, partagé par le bouton de vérification et par le résumé de fin.
        function comparisonBilanDesClesHtml(nomDuFichierA, nomDuFichierB, mesureA, mesureB) {
            return `<div class="text-left space-y-1">
                        <div class="text-xs text-slate-600">${comparisonPhraseDUnFichier(nomDuFichierA, mesureA)}</div>
                        <div class="text-xs text-slate-600">${comparisonPhraseDUnFichier(nomDuFichierB, mesureB)}</div>
                        ${comparisonVerdictDesClesHtml(mesureA, mesureB)}
                    </div>`;
        }

        // Nom affichable d'un fichier de la comparaison (une source, ou un jeu temporaire).
        function comparisonNomDuFichier(tableId) {
            const table = state.tables[tableId];
            return (table && table.name) || tableId || '?';
        }

        // Mesure les deux côtés d'un coup, avec les réglages de l'écran.
        async function comparisonMesurerLesDeuxCotes(connexion, tIdA, tIdB, keyParts, ignoreSpace, ignoreCase) {
            const mesureA = await comparisonMesurerLesCles(
                connexion,
                sqlIdent(duckTableName(tIdA)),
                comparisonCleCompositeSql(keyParts, 'A', ignoreSpace, ignoreCase)
            );
            const mesureB = await comparisonMesurerLesCles(
                connexion,
                sqlIdent(duckTableName(tIdB)),
                comparisonCleCompositeSql(keyParts, 'B', ignoreSpace, ignoreCase)
            );
            return { mesureA, mesureB };
        }

        // Bouton « Vérifier la clé » : on mesure AVANT de lancer une comparaison qui peut durer, pour
        // savoir tout de suite si la clé choisie désigne bien une ligne de chaque côté.
        async function comparisonVerifierLesCles() {
            const zone = el('compKeyCheck');
            if (!zone) return;
            const tIdA = el('compTableA').value,
                tIdB = el('compTableB').value;
            const keyParts = compKeyParts();
            if (!tIdA || !tIdB || !keyParts.length) {
                zone.innerHTML =
                    '<p class="text-xs text-slate-400 italic">Choisissez les deux fichiers et au moins une colonne de clé de chaque côté.</p>';
                return;
            }
            zone.innerHTML = '<p class="text-xs text-slate-400 italic">Mesure des clés en cours…</p>';
            try {
                const { conn } = await getDB();
                const { mesureA, mesureB } = await comparisonMesurerLesDeuxCotes(
                    conn,
                    tIdA,
                    tIdB,
                    keyParts,
                    el('compIgnoreSpace').checked,
                    el('compIgnoreCase').checked
                );
                zone.innerHTML = comparisonBilanDesClesHtml(
                    comparisonNomDuFichier(tIdA),
                    comparisonNomDuFichier(tIdB),
                    mesureA,
                    mesureB
                );
            } catch (e) {
                zone.innerHTML = `<p class="text-xs text-red-600">Mesure impossible : ${escapeHTML(e.message)}</p>`;
            }
        }

        // Un côté de la comparaison des ÉCARTS DE CLÉ : une ligne PAR CLÉ, jamais par ligne de fichier.
        // On garde au passage le nombre d'occurrences, et une valeur telle qu'écrite dans le fichier pour
        // chaque partie de la clé (quand on ignore la casse, c'est l'une des graphies rencontrées).
        function comparisonCoteRegroupeSql(nomDeLaTableDuckDb, expressionDeLaCle, colonnesDeLaCle) {
            const representants = colonnesDeLaCle.map(
                (colonne, rang) => `MIN(CAST(${sqlIdent(colonne)} AS VARCHAR)) AS __cle${rang}`
            );
            return (
                `SELECT ${expressionDeLaCle} AS __nk, COUNT(*) AS __occurrences, ${representants.join(', ')}` +
                ` FROM ${nomDeLaTableDuckDb} WHERE ${expressionDeLaCle} IS NOT NULL GROUP BY 1`
            );
        }

        async function runComparison() {
            hideError();
            const tIdA = el('compTableA').value,
                tIdB = el('compTableB').value;
            const keyParts = compKeyParts();

            if (!tIdA || !tIdB) return showError('Sélectionnez les deux tables à comparer.');
            if (!keyParts.length) return showError('Choisissez au moins une colonne de clé de chaque côté (A ↔ B).');
            const validMappings = compState.mappings.filter(m => m.colA && m.colB);
            // V6.19 : sans aucune correspondance, on ne compare QUE la présence des clés
            // (celles en moins et celles en plus d'un fichier à l'autre).
            const keyOnly = validMappings.length === 0;

            el('btnRunComp').disabled = true;
            el('compProgressArea').classList.remove('hidden');
            el('compDownloadArea').classList.add('hidden');
            el('compSummary').innerHTML = '';

            const compProgressBarElement = el('compProgressBar'),
                compStatusTextElement = el('compStatusText');
            compProgressBarElement.style.width = '10%';

            const ignoreCase = el('compIgnoreCase').checked,
                ignoreSpace = el('compIgnoreSpace').checked;

            try {
                const { conn } = await getDB();

                const keyExprA = comparisonCleCompositeSql(keyParts, 'A', ignoreSpace, ignoreCase),
                    keyExprB = comparisonCleCompositeSql(keyParts, 'B', ignoreSpace, ignoreCase);

                // On mesure la répétition des clés AVANT la jointure : c'est elle qui explique la taille
                // du rapport, et elle doit être dite même quand tout va bien.
                compStatusTextElement.innerText = 'Mesure des clés...';
                const { mesureA, mesureB } = await comparisonMesurerLesDeuxCotes(
                    conn,
                    tIdA,
                    tIdB,
                    keyParts,
                    ignoreSpace,
                    ignoreCase
                );
                compProgressBarElement.style.width = '25%';
                compStatusTextElement.innerText = 'Exécution de la jointure SQL...';

                // Une colonne de sortie par partie de clé : plus lisible qu'une clé concaténée.
                const outSchema = [];
                const selectExprs = [];
                keyParts.forEach((couple, rang) => {
                    const h = dedupeHeader(outSchema, keyParts.length > 1 ? `CLE_${couple.colA}` : 'CLE_IDENTIFICATION');
                    outSchema.push(h);
                    // En mode « écarts de clé » les deux côtés sont regroupés : la valeur d'origine est
                    // ramenée par la colonne __cleN du regroupement, et non par la colonne du fichier.
                    const valeurA = keyOnly ? `a.__cle${rang}` : `CAST(a.${sqlIdent(couple.colA)} AS VARCHAR)`;
                    const valeurB = keyOnly ? `b.__cle${rang}` : `CAST(b.${sqlIdent(couple.colB)} AS VARCHAR)`;
                    selectExprs.push(`COALESCE(${valeurA}, ${valeurB}) AS ${sqlIdent(h)}`);
                });
                outSchema.push('STATUT_LIGNE');

                const diffFlags = validMappings.map((m, i) => `__d${i}`);
                validMappings.forEach((m, i) => {
                    const nA = comparisonNormExpr('a', m.colA, ignoreSpace, ignoreCase, false);
                    const nB = comparisonNormExpr('b', m.colB, ignoreSpace, ignoreCase, false);
                    selectExprs.push(`(${nA} <> ${nB}) AS ${sqlIdent(diffFlags[i])}`);
                });
                selectExprs.push(`
                    CASE
                        WHEN a.__nk IS NULL THEN 'Manquant Fichier A'
                        WHEN b.__nk IS NULL THEN 'Manquant Fichier B'
                        ${
                            keyOnly
                                ? "ELSE 'Clé présente des deux côtés'"
                                : `WHEN (${diffFlags.map(f => `COALESCE(${f}, false)`).join(' OR ')}) THEN 'Valeurs Différentes'
                        ELSE '100% Identique'`
                        }
                    END AS ${sqlIdent('STATUT_LIGNE')}
                `);
                // En mode « écarts de clé », le rapport dit aussi COMBIEN de fois la clé figure de chaque
                // côté : c'est l'information que la ligne regroupée remplace, et elle est précieuse.
                if (keyOnly) {
                    outSchema.push('OCCURRENCES_FICHIER_A');
                    outSchema.push('OCCURRENCES_FICHIER_B');
                    selectExprs.push(`COALESCE(a.__occurrences, 0)::BIGINT AS ${sqlIdent('OCCURRENCES_FICHIER_A')}`);
                    selectExprs.push(`COALESCE(b.__occurrences, 0)::BIGINT AS ${sqlIdent('OCCURRENCES_FICHIER_B')}`);
                }
                validMappings.forEach((m, i) => {
                    const hA = dedupeHeader(outSchema, `VAL_${m.colA}_(Fich_A)`);
                    outSchema.push(hA);
                    const hB = dedupeHeader(outSchema, `VAL_${m.colB}_(Fich_B)`);
                    outSchema.push(hB);
                    const hD = dedupeHeader(outSchema, `STATUT_DIFFERENCE_${m.colA}`);
                    outSchema.push(hD);
                    selectExprs.push(`a.${sqlIdent(m.colA)} AS ${sqlIdent(hA)}`);
                    selectExprs.push(`b.${sqlIdent(m.colB)} AS ${sqlIdent(hB)}`);
                    selectExprs.push(`
                        CASE
                            WHEN a.__nk IS NULL THEN 'Manquant A'
                            WHEN b.__nk IS NULL THEN 'Manquant B'
                            WHEN ${diffFlags[i]} THEN 'DIFFÉRENT'
                            ELSE 'Identique'
                        END AS ${sqlIdent(hD)}
                    `);
                });

                // Mode « écarts de clé » : chaque côté est REGROUPÉ par clé avant la jointure, donc une
                // clé ne peut plus produire qu'UNE ligne — quel que soit le nombre de fois qu'elle figure
                // dans les fichiers. Mode « comparaison de valeurs » : on garde les lignes, puisqu'il faut
                // bien lire les valeurs ; le résumé prévient alors de la multiplication.
                const colonnesDeLaCleA = keyParts.map(couple => couple.colA);
                const colonnesDeLaCleB = keyParts.map(couple => couple.colB);
                const coteA = keyOnly
                    ? comparisonCoteRegroupeSql(sqlIdent(duckTableName(tIdA)), keyExprA, colonnesDeLaCleA)
                    : `SELECT *, ${keyExprA} AS __nk FROM ${sqlIdent(duckTableName(tIdA))} WHERE ${keyExprA} IS NOT NULL`;
                const coteB = keyOnly
                    ? comparisonCoteRegroupeSql(sqlIdent(duckTableName(tIdB)), keyExprB, colonnesDeLaCleB)
                    : `SELECT *, ${keyExprB} AS __nk FROM ${sqlIdent(duckTableName(tIdB))} WHERE ${keyExprB} IS NOT NULL`;

                const resultTId = 'cmp_' + generateId();
                await conn.query(`
                    CREATE TABLE ${sqlIdent(duckTableName(resultTId))} AS
                    SELECT row_number() OVER () AS __rn, * FROM (
                        SELECT ${selectExprs.join(', ')}
                        FROM (${coteA}) a
                        FULL OUTER JOIN (${coteB}) b
                            ON a.__nk = b.__nk
                    ) AS sub
                `);
                compProgressBarElement.style.width = '50%';
                compStatusTextElement.innerText = 'Calcul des statistiques...';

                // Le total compté est celui du RAPPORT : il est donc toujours égal à la somme des trois
                // autres tuiles. En mode « écarts de clé », une ligne de rapport = une clé.
                const totalRes = await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(resultTId))}`);
                const statsRes = await conn.query(`
                    SELECT
                        SUM(CASE WHEN ${sqlIdent('STATUT_LIGNE')} IN ('100% Identique', 'Clé présente des deux côtés') THEN 1 ELSE 0 END)::BIGINT AS identical,
                        SUM(CASE WHEN ${sqlIdent('STATUT_LIGNE')} = 'Valeurs Différentes' THEN 1 ELSE 0 END)::BIGINT AS diff,
                        SUM(CASE WHEN ${sqlIdent('STATUT_LIGNE')} = 'Manquant Fichier A' THEN 1 ELSE 0 END)::BIGINT AS missinga,
                        SUM(CASE WHEN ${sqlIdent('STATUT_LIGNE')} = 'Manquant Fichier B' THEN 1 ELSE 0 END)::BIGINT AS missingb
                    FROM ${sqlIdent(duckTableName(resultTId))}
                `);

                const total = Number(arrowResultToObjects(totalRes)[0].n);
                const statsRow = arrowResultToObjects(statsRes)[0];
                const identical = Number(statsRow.identical || 0),
                    diff = Number(statsRow.diff || 0);
                const missingA = Number(statsRow.missinga || 0),
                    missingB = Number(statsRow.missingb || 0);

                const headerLine = outSchema.map(escapeCSV).join(';') + '\n';
                const blobParts = [headerLine];
                let chunkBuf = [];
                compProgressBarElement.style.width = '70%';
                compStatusTextElement.innerText = 'Écriture du rapport...';
                await duckStreamRows(
                    resultTId,
                    0,
                    async row => {
                        chunkBuf.push(outSchema.map(h => escapeCSV(row[h])).join(';'));
                        if (chunkBuf.length >= 5000) {
                            blobParts.push(chunkBuf.join('\n') + '\n');
                            chunkBuf = [];
                        }
                    },
                    (cursor, total2) => {
                        compProgressBarElement.style.width = 70 + Math.floor((cursor / total2) * 30) + '%';
                    }
                );
                if (chunkBuf.length > 0) blobParts.push(chunkBuf.join('\n') + '\n');

                await duckDropTable(resultTId);

                compProgressBarElement.style.width = '100%';
                compStatusTextElement.innerText = 'Comparaison Terminée !';
                const keyLbl = keyParts.map(k => k.colA).join(' + ');
                const tile = (bg, lbl, val, sub) =>
                    `<div class="${bg} border p-4 rounded-xl"><div class="text-xs font-bold uppercase mb-1">${lbl}</div><div class="text-2xl font-black">${Number(val).toLocaleString('fr-FR')}</div>${sub ? `<div class="text-[10px] text-slate-500 mt-1">${sub}</div>` : ''}</div>`;
                // Le bilan des clés est affiché dans les DEUX modes : c'est lui qui explique l'écart entre
                // le nombre de lignes des fichiers et le nombre de lignes du rapport.
                const bilanDesCles = comparisonBilanDesClesHtml(
                    comparisonNomDuFichier(tIdA),
                    comparisonNomDuFichier(tIdB),
                    mesureA,
                    mesureB
                );
                el('compSummary').innerHTML = keyOnly
                    ? `<div class="text-xs text-slate-500 mb-2 text-left">Comparaison des <strong>écarts de clé</strong> sur <strong>${escapeHTML(keyLbl)}</strong> — aucune valeur n'était à contrôler. Les chiffres ci-dessous comptent des <strong>clés</strong>, pas des lignes : une clé répétée n'est comptée qu'une fois, et le rapport donne son nombre d'occurrences de chaque côté.</div>
                       <div class="mb-3">${bilanDesCles}</div>
                       <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
                       ${tile('bg-indigo-50', 'Clés évaluées', total, 'union des deux fichiers')}
                       ${tile('bg-emerald-50', 'Présentes des deux côtés', identical, '')}
                       ${tile('bg-red-50', 'En plus dans A', missingB, 'absentes du fichier B')}
                       ${tile('bg-amber-50', 'En plus dans B', missingA, 'absentes du fichier A')}</div>`
                    : `<div class="mb-3">${bilanDesCles}</div>
                       <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
                       ${tile('bg-indigo-50', 'Lignes du rapport', total, 'appariements évalués')}
                       ${tile('bg-emerald-50', '100% Identiques', identical, '')}
                       ${tile('bg-amber-50', 'Avec Différences', diff, '')}
                       ${tile('bg-red-50', 'Lignes Absentes', missingA + missingB, `${missingB} en plus dans A · ${missingA} en plus dans B`)}</div>`;

                const finalBlob = new Blob(['﻿', ...blobParts], { type: 'text/csv;charset=utf-8;' });
                const compDownloadLinkElement = el('compDownloadLink');
                compDownloadLinkElement.href = URL.createObjectURL(finalBlob);
                compDownloadLinkElement.download = `Comparaison_Resultat_${Date.now()}.csv`;
                el('compDownloadArea').classList.remove('hidden');
            } catch (e) {
                showError('Erreur lors de la comparaison: ' + e.message);
            } finally {
                el('btnRunComp').disabled = false;
            }
        }
