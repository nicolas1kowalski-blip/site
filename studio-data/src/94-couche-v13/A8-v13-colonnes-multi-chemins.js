        // ======= V13 : « L'UN OU L'AUTRE LIEN » NE MULTIPLIE PLUS LES LIGNES, ET ON VOIT CE QUI LES MULTIPLIE =======
        //
        // Le fichier produit porte UNE ligne par ligne de la table de départ. C'est la règle de
        // l'extraction, et un seul réglage a le droit de la rompre : « une ligne par valeur »,
        // choisi colonne par colonne, en connaissance de cause.
        //
        // Une colonne restait en dehors de cette règle : celle qui emprunte « l'un ou l'autre
        // lien », quand deux chemins mènent à la même table (le souscripteur ET le bénéficiaire,
        // par exemple). Sa valeur venant de plusieurs routes, elle les JOIGNAIT toutes, et l'écran
        // se contentait de l'écrire en petit et en gris : « une ligne par valeur (chemins
        // multiples) ». Mesuré sur un cas ordinaire — 140 000 affaires, 220 000 liens, deux
        // adresses par objet — le fichier sortait à 440 000 lignes sans que rien n'ait été demandé.
        //
        // Les routes sont désormais réunies DANS une sous-requête, exactement comme pour une
        // synthèse (V12.11.1) : une ligne de départ reste une ligne, et les valeurs des deux
        // chemins se regroupent dans la même cellule. « Une ligne par valeur » reste disponible
        // pour qui le veut vraiment — et, dans ce cas, l'écran le dit en toutes lettres au lieu de
        // le laisser découvrir sur le fichier produit.
        (function () {
            /**
             * Les ancrages d'une colonne ORDINAIRE qui emprunte « l'un ou l'autre lien ».
             *
             * Même recherche que pour une synthèse (`v12LinkAnchors`), sans la condition sur le
             * type de colonne : ici, il s'agit d'une colonne tout court.
             */
            function v13AncragesDesCheminsMultiples(baseId, colonne) {
                if (!colonne || colonne.kind || !colonne.tableId || colonne.tableId === baseId) return null;
                if (typeof V12_VIA_ANY === 'undefined' || colonne.via !== V12_VIA_ANY) return null;
                const dejaVus = new Set();
                const ancrages = [];
                advViaOptions(colonne.tableId).forEach(option => {
                    const ancrage = advLinkAnchor(baseId, colonne.tableId, option.key);
                    if (!ancrage) return;
                    const repere =
                        advRouteKey(ancrage.parentId, ancrage.parentVia || '') +
                        '¦' +
                        ancrage.childCol +
                        '¦' +
                        ancrage.parentCol;
                    if (dejaVus.has(repere)) return;
                    dejaVus.add(repere);
                    ancrages.push(ancrage);
                });
                return ancrages.length ? ancrages : null;
            }
            /**
             * Les chemins à réunir pour cette colonne, ou rien si elle n'est pas concernée.
             *
             * On les recalcule à chaque fois plutôt que de les ranger sur la colonne : c'est le
             * travail de quelques comparaisons, et une valeur rangée finit toujours par survivre
             * à la configuration qui l'a produite.
             */
            function v13CheminsReunis(colonne, baseId) {
                if (!baseId || advPlusieursValeurs(colonne, baseId) === 'lignes') return null;
                return v13AncragesDesCheminsMultiples(baseId, colonne);
            }

            // ---- 1. Le réglage « plusieurs valeurs » s'applique aussi à « l'un ou l'autre lien » ----
            Studio.extend(
                'advPlusieursValeurs',
                base =>
                    function (colonne, baseId) {
                        if (
                            colonne &&
                            !colonne.kind &&
                            colonne.tableId &&
                            colonne.tableId !== baseId &&
                            typeof V12_VIA_ANY !== 'undefined' &&
                            colonne.via === V12_VIA_ANY
                        )
                            // Par défaut, « le lien renseigné, quel qu'il soit » : exactement ce que
                            // donnait la jointure des routes (COALESCE), mais sans joindre, donc sans
                            // jamais multiplier. Les deux autres réglages restent offerts.
                            return ADV_PLUSIEURS_VALEURS[colonne.plusieurs] ? colonne.plusieurs : 'premiere';
                        return base.apply(this, arguments);
                    },
                { motif: 'une colonne par plusieurs chemins tient sur une seule ligne, comme les autres' }
            );

            // ---- 2. L'écran propose le choix, au lieu d'annoncer une fatalité ----
            Studio.extend(
                'advChoixPlusieursValeursHtml',
                base =>
                    function (colonne, baseId) {
                        if (
                            !colonne ||
                            colonne.kind ||
                            colonne.tableId === baseId ||
                            typeof V12_VIA_ANY === 'undefined' ||
                            colonne.via !== V12_VIA_ANY
                        )
                            return base.apply(this, arguments);
                        const reglage = advPlusieursValeurs(colonne, baseId);
                        const eclate = reglage === 'lignes';
                        return (
                            `<select onchange="advChangerPlusieursValeurs('${colonne.id}', this.value)" title="Cette colonne vient de PLUSIEURS chemins à la fois. Les valeurs de tous les chemins sont réunies : regroupées sur une seule ligne, réduites à la première, ou une ligne par valeur — ce dernier choix est le seul qui change le nombre de lignes du fichier." class="mt-1 block w-full border p-1 rounded text-[10px] ${eclate ? 'border-amber-400 bg-amber-50 text-amber-800 font-bold' : 'border-slate-200 bg-white text-slate-500'}">` +
                            Object.entries(ADV_PLUSIEURS_VALEURS)
                                .map(
                                    ([valeur, libelle]) =>
                                        `<option value="${valeur}" ${valeur === reglage ? 'selected' : ''}>${escapeHTML(libelle)}</option>`
                                )
                                .join('') +
                            `</select><span class="block text-[10px] text-slate-400 mt-0.5">tous les chemins réunis</span>`
                        );
                    },
                { motif: 'le choix du nombre de lignes est offert aussi aux colonnes à plusieurs chemins' }
            );

            // ---- 3. Les tables de rattachement de chaque chemin doivent être jointes ----
            // Ce n'est pas la table de la colonne qu'on joint — elle est lue dans la sous-requête —
            // mais la table SUR LAQUELLE chaque chemin s'accroche, pour que la sous-requête ait une
            // valeur à comparer.
            v13State.liensEnPlus = [];
            Studio.extend(
                'buildAdvSql',
                base =>
                    function (spec) {
                        v13State.liensEnPlus = [];
                        try {
                            ((spec && spec.columns) || []).forEach(colonne => {
                                const chemins = v13CheminsReunis(colonne, spec && spec.baseId);
                                if (!chemins) return;
                                chemins.forEach(ancrage =>
                                    v13State.liensEnPlus.push({ tableId: ancrage.parentId, via: ancrage.parentVia || '' })
                                );
                            });
                            return base.apply(this, arguments);
                        } finally {
                            v13State.liensEnPlus = [];
                        }
                    },
                { motif: 'les chemins d’une colonne « l’un ou l’autre lien » sont repérés avant de bâtir la requête' }
            );
            Studio.extend(
                'advPlanJoins',
                base =>
                    function (baseId, needs) {
                        const enPlus = Array.isArray(v13State.liensEnPlus) ? v13State.liensEnPlus : [];
                        return base.call(this, baseId, [...(Array.isArray(needs) ? needs : []), ...enPlus]);
                    },
                { motif: 'les tables de rattachement des chemins multiples sont jointes' }
            );

            /**
             * Les chemins réunis, chacun avec son RANG.
             *
             * Le rang n'est pas un détail : il reproduit l'ordre de `COALESCE(route1, route2)`,
             * c'est-à-dire « la valeur du premier chemin renseigné ». Sans lui, on prendrait une
             * valeur au hasard parmi les chemins, et un contrat souscrit par une personne physique
             * ET par une personne morale ne donnerait plus la même adresse qu'avant.
             */
            function v13CheminsReunisSql(map, colonne, ancrages, expressionDeLaValeur) {
                const table = sqlIdent(duckTableName(colonne.tableId));
                return ancrages
                    .map((ancrage, rang) => {
                        const cle = `${advNk('s.' + sqlIdent(ancrage.childCol))} = ${advNk(advAlias(map, { tableId: ancrage.parentId, via: ancrage.parentVia }) + '.' + sqlIdent(ancrage.parentCol))}`;
                        return `SELECT ${expressionDeLaValeur} AS v, ${rang} AS rp, s.${sqlIdent('__rn')} AS rn FROM ${table} s WHERE ${cle}`;
                    })
                    .join('\n      UNION ALL ');
            }

            // ---- 4. La valeur : les chemins réunis, puis ramenés sur une seule ligne ----
            Studio.extend(
                'advExpandCol',
                base =>
                    function (map, colonne, hierRef, spec) {
                        const baseId = (spec && spec.baseId) || (state.advExtract || {}).baseId;
                        const ancrages = v13CheminsReunis(colonne, baseId);
                        if (!ancrages) return base.apply(this, arguments);
                        const valeur = advTransformee(`s.${sqlIdent(colonne.col)}`, colonne.transform);
                        const texte = `NULLIF(TRIM(CAST(${valeur} AS VARCHAR)), '')`;
                        const alias = colonne.alias || colonne.col;
                        if (advPlusieursValeurs(colonne, baseId) === 'premiere')
                            return [
                                {
                                    expr: `(SELECT u.v FROM (${v13CheminsReunisSql(map, colonne, ancrages, valeur)}) u WHERE u.v IS NOT NULL ORDER BY u.rp, u.rn LIMIT 1)`,
                                    alias
                                }
                            ];
                        return [
                            {
                                expr: `(SELECT STRING_AGG(DISTINCT u.v, ' | ') FROM (${v13CheminsReunisSql(map, colonne, ancrages, texte)}) u)`,
                                alias
                            }
                        ];
                    },
                { motif: 'une colonne par plusieurs chemins est lue par sous-requête, sans joindre sa table' }
            );

            // ---- 5. Ce qui multiplie les lignes se voit AVANT de produire le fichier ----
            /** Les colonnes réglées sur « une ligne par valeur », celles qui font grossir le fichier. */
            function v13ColonnesQuiMultiplient(spec) {
                if (!spec || !spec.baseId) return [];
                return (spec.columns || []).filter(
                    colonne =>
                        !colonne.kind &&
                        colonne.tableId &&
                        colonne.tableId !== spec.baseId &&
                        advPlusieursValeurs(colonne, spec.baseId) === 'lignes'
                );
            }
            /**
             * L'avertissement, en haut des colonnes en sortie.
             *
             * Le nombre de lignes du fichier est la première chose que l'on vérifie, et la dernière
             * que l'on comprend. Autant le dire là où le réglage se fait, et nommer les colonnes
             * responsables : sinon on découvre la multiplication sur le fichier livré.
             */
            function v13AvertissementDeMultiplicationHtml(spec) {
                const fautives = v13ColonnesQuiMultiplient(spec);
                if (!fautives.length) return '';
                const nomDe = identifiant => (state.tables[identifiant] || {}).name || identifiant;
                const listees = fautives
                    .map(colonne => `« ${escapeHTML(advNomEnSortie(colonne))} » (${escapeHTML(nomDe(colonne.tableId))})`)
                    .join(', ');
                return `<div class="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                    <b>⚠️ ${fautives.length} colonne(s) font « une ligne par valeur » : le fichier aura PLUS de lignes que la table de départ.</b>
                    <div class="mt-0.5">${listees}</div>
                    <div class="mt-0.5 text-amber-700">Pour garder une ligne par ${escapeHTML(nomDe(spec.baseId))}, réglez-les sur « une seule ligne, valeurs regroupées » dans la colonne Transformation.</div>
                </div>`;
            }
            Studio.extend(
                'renderAdvExtract',
                base =>
                    function () {
                        const resultat = base.apply(this, arguments);
                        try {
                            const spec = state.advExtract;
                            const avertissement = v13AvertissementDeMultiplicationHtml(spec);
                            if (!avertissement) return resultat;
                            // Juste au-dessus du tableau des colonnes : là où le réglage se fait.
                            const tableau = document.querySelector('[ondrop^="reorderDrop(event,\'advcol\'"]');
                            const cadre = tableau && tableau.closest('table') && tableau.closest('table').parentNode;
                            if (cadre && cadre.parentNode && !cadre.parentNode.querySelector('.v13-multiplie-avis')) {
                                const boite = document.createElement('div');
                                boite.className = 'v13-multiplie-avis';
                                boite.innerHTML = avertissement;
                                cadre.parentNode.insertBefore(boite, cadre);
                            }
                        } catch (e) {}
                        return resultat;
                    },
                { motif: 'les colonnes qui multiplient les lignes sont annoncées avant de produire le fichier' }
            );
        })();
