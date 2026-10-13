        // ======================= V13 : RELIER UNE SOURCE À LA VOLÉE, DEPUIS EXTRAIRE =======================
        //
        // Le besoin, dit simplement : « j'ai un fichier en entrée et j'ai besoin de le compléter ».
        // On dépose sa liste — un jeu temporaire —, on la prend comme table de départ, et il ne
        // reste qu'à aller chercher les colonnes qui manquent dans les autres sources. Sauf qu'une
        // colonne ne se ramène qu'en suivant un LIEN, et qu'un lien ne se déclarait que dans le
        // modèle de données : un autre écran, un mode « lien », deux clics sur un schéma, puis le
        // retour dans Extraire. Pire : un jeu temporaire n'apparaît pas dans le modèle (c'est
        // voulu, il ne doit salir ni les sources ni les sauvegardes), donc le lien dont on avait
        // besoin ne pouvait tout simplement pas se déclarer.
        //
        // Ici, le lien se déclare là où il sert, en une fois, et surtout il est MESURÉ avant d'être
        // créé : combien de valeurs de ma liste se retrouvent dans l'autre fichier, et combien de
        // lignes chacune y trouve. Ces deux nombres disent d'avance ce que vaudra l'extraction —
        // le second prévient la multiplication des lignes avant qu'elle n'arrive.
        //
        // Un lien créé ici est un lien ordinaire : tout le reste de l'application s'en sert sans
        // rien savoir de sa provenance. Il porte seulement une marque, « à la volée », pour qu'on
        // le reconnaisse et qu'on puisse le retirer d'un clic.
        v13State.liens = { propositions: null, enRecherche: false, message: '', ouvert: false };

        /** Les tables que l'on peut relier à la table de départ : les sources et les jeux temporaires. */
        function v13TablesARelier(baseId) {
            const sources = Object.values(state.tables).filter(t => t && t.status === 'ready');
            const temporaires = typeof v12TmpList === 'function' ? v12TmpList() : [];
            const vues = new Set();
            return [...sources, ...temporaires].filter(t => {
                if (!t || t.id === baseId || vues.has(t.id)) return false;
                vues.add(t.id);
                return (t.headers || []).length > 0;
            });
        }

        /**
         * La FORME d'une valeur : les chiffres deviennent 9, les lettres A, le reste ne bouge pas.
         *
         * « AFF2807 » et « CTR15 » ont la même forme « A9 » ; « 417 » a la forme « 9 » et
         * « Libelle 15 » la forme « A 9 ». Deux colonnes de formes différentes ne se rapprocheront
         * jamais : les comparer coûterait une lecture de la grosse table pour rien. C'est un tri
         * grossier, fait sur l'échantillon déjà en mémoire, sans la moindre requête.
         */
        function v13FormeDUneValeur(valeur) {
            const texte = String(valeur == null ? '' : valeur).trim();
            if (!texte) return '';
            return texte
                .replace(/[0-9]+/g, '9')
                .replace(/[^\W0-9_]+/gu, 'A')
                .replace(/(.)\1+/g, '$1')
                .slice(0, 12);
        }
        /** Les formes prises par une colonne dans l'échantillon de la table. */
        function v13FormesDUneColonne(table, colonne) {
            const formes = new Set();
            ((table && table.sampleData) || []).forEach(ligne => {
                const forme = v13FormeDUneValeur(ligne && ligne[colonne]);
                if (forme) formes.add(forme);
            });
            return formes;
        }
        /** Deux colonnes ont-elles des valeurs de même allure ? Sans échantillon, on n'écarte rien. */
        function v13MemeAllure(formesA, formesB) {
            if (!formesA.size || !formesB.size) return true;
            for (const forme of formesA) if (formesB.has(forme)) return true;
            return false;
        }
        /** Au-delà, on ne compare plus : une table de cent colonnes n'est pas une table de clés. */
        const V13_COLONNES_COMPAREES_MAX = 25;
        const V13_MOTS_DE_CLE = /(ID|CODE|CLE|KEY|NUM|REF|FK|PK)/;
        /** Ce que les NOMS laissent penser du rapprochement — un appoint au classement, jamais le juge. */
        function v13ProximiteDesNoms(colonneDeDepart, colonneDeLAutre, nomDeLAutreTable) {
            const a = normColName(colonneDeDepart);
            const b = normColName(colonneDeLAutre);
            if (!a || !b) return { bonus: 0, raison: '' };
            if (a === b) return { bonus: 0.1, raison: 'mêmes noms de colonne' };
            if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a)))
                return { bonus: 0.06, raison: 'noms de colonne proches' };
            const cible = normColName(cleanFileName(nomDeLAutreTable || ''));
            if (V13_MOTS_DE_CLE.test(b) && cible.length >= 3 && b.includes(cible))
                return { bonus: 0.04, raison: 'ressemble à une clé de cette table' };
            return { bonus: 0, raison: 'valeurs communes' };
        }

        /**
         * Les colonnes de la table de départ qui peuvent servir de clé, avec leur nombre de valeurs.
         *
         * Une colonne qui ne porte qu'une seule valeur (« à traiter », « 2026 ») se retrouve partout
         * et ne veut rien dire : on l'écarte avant de mesurer quoi que ce soit.
         */
        async function v13ClesDuDepart(baseId) {
            const table = state.tables[baseId];
            if (!table) return [];
            const colonnes = (table.headers || []).slice(0, V13_COLONNES_COMPAREES_MAX);
            if (!colonnes.length) return [];
            const { conn } = await getDB();
            const res = arrowResultToObjects(
                await conn.query(`SELECT u.c AS colonne, COUNT(DISTINCT u.v)::BIGINT AS n FROM (
                        SELECT ${v13ColonnesDepliees('x', colonnes)} AS u FROM ${sqlIdent(duckTableName(baseId))} x
                    ) WHERE u.v IS NOT NULL GROUP BY 1`)
            );
            return res
                .map(r => ({ colonne: String(r.colonne), valeurs: Number(r.n) }))
                .filter(c => c.valeurs > 1)
                .sort((a, b) => b.valeurs - a.valeurs);
        }
        /** Les colonnes d'une table, dépliées en autant de lignes : une seule lecture les compare toutes. */
        function v13ColonnesDepliees(alias, colonnes) {
            return (
                'UNNEST([' +
                colonnes.map(c => `{'c': ${sqlLiteral(c)}, 'v': ${sqlCleDeLien(alias + '.' + sqlIdent(c))}}`).join(', ') +
                '])'
            );
        }

        /**
         * Croise toutes les colonnes retenues de la table de départ avec toutes celles d'une autre
         * table, EN UNE SEULE LECTURE de chacune. Le nom ne sert plus à choisir quoi mesurer : ce
         * serait passer à côté d'une liste dont la colonne s'appelle « N° affaire » quand l'autre
         * fichier dit « NUM_AFFAIRE ».
         */
        async function v13CroiserAvecUneTable(baseId, clesDeDepart, autreTable) {
            const tableDeDepart = state.tables[baseId];
            const colonnesDeDepart = clesDeDepart.map(c => c.colonne);
            const formesDeDepart = {};
            colonnesDeDepart.forEach(c => (formesDeDepart[c] = v13FormesDUneColonne(tableDeDepart, c)));
            const colonnesDeLAutre = (autreTable.headers || []).slice(0, V13_COLONNES_COMPAREES_MAX).filter(colonne => {
                const formes = v13FormesDUneColonne(autreTable, colonne);
                return colonnesDeDepart.some(c => v13MemeAllure(formesDeDepart[c], formes));
            });
            if (!colonnesDeLAutre.length) return [];
            const { conn } = await getDB();
            const requete = `
                WITH depart AS (
                    SELECT DISTINCT u.c AS colonne, u.v AS k FROM (
                        SELECT ${v13ColonnesDepliees('x', colonnesDeDepart)} AS u
                        FROM ${sqlIdent(duckTableName(baseId))} x
                    ) WHERE u.v IS NOT NULL
                ), autre AS (
                    SELECT u.c AS colonne, u.v AS k FROM (
                        SELECT ${v13ColonnesDepliees('y', colonnesDeLAutre)} AS u
                        FROM ${sqlIdent(duckTableName(autreTable.id))} y
                    ) WHERE u.v IS NOT NULL
                )
                SELECT d.colonne AS depart, a.colonne AS vers,
                       COUNT(DISTINCT d.k)::BIGINT AS retrouvees, COUNT(*)::BIGINT AS lignes
                FROM depart d JOIN autre a ON a.k = d.k
                GROUP BY 1, 2`;
            const lignes = arrowResultToObjects(await conn.query(requete));
            const parColonne = {};
            clesDeDepart.forEach(c => (parColonne[c.colonne] = c.valeurs));
            return lignes
                .map(r => {
                    const colonneDeDepart = String(r.depart);
                    const colonneDeLAutre = String(r.vers);
                    const retrouvees = Number(r.retrouvees);
                    const lignesEnFace = Number(r.lignes);
                    const cles = parColonne[colonneDeDepart] || 0;
                    const noms = v13ProximiteDesNoms(colonneDeDepart, colonneDeLAutre, autreTable.name);
                    return {
                        autreId: autreTable.id,
                        nomDeLAutre: autreTable.name,
                        colonneDeDepart,
                        colonneDeLAutre,
                        raison: noms.raison,
                        confiance: (cles ? retrouvees / cles : 0) + noms.bonus,
                        mesure: {
                            cles,
                            retrouvees,
                            lignes: lignesEnFace,
                            taux: cles ? retrouvees / cles : 0,
                            parLigne: retrouvees ? lignesEnFace / retrouvees : 0
                        }
                    };
                })
                .filter(p => p.mesure.retrouvees > 0);
        }

        /**
         * Ce que vaut vraiment un rapprochement, mesuré sur les données.
         *
         * Trois nombres, et ils se lisent dans cet ordre :
         *  - combien de valeurs différentes ma colonne porte ;
         *  - combien d'entre elles se retrouvent dans l'autre fichier (le taux de
         *    rapprochement : au-dessous de quelques pour cent, ce n'est pas un lien) ;
         *  - combien de lignes de l'autre fichier chacune y trouve (au-dessus de 1, le lien
         *    multipliera les lignes — autant le savoir AVANT de l'utiliser).
         */
        async function v13MesurerUnRapprochement(baseId, colonneDeDepart, autreId, colonneDeLAutre) {
            const { conn } = await getDB();
            const cle = (alias, colonne) => sqlCleDeLien(`${alias}.${sqlIdent(colonne)}`);
            const requete = `
                WITH depart AS (
                    SELECT DISTINCT ${cle('x', colonneDeDepart)} AS k FROM ${sqlIdent(duckTableName(baseId))} x
                ), autre AS (
                    SELECT ${cle('y', colonneDeLAutre)} AS k FROM ${sqlIdent(duckTableName(autreId))} y
                )
                SELECT
                    (SELECT COUNT(*) FROM depart WHERE k IS NOT NULL)::BIGINT AS cles,
                    (SELECT COUNT(*) FROM depart d WHERE d.k IS NOT NULL
                        AND EXISTS (SELECT 1 FROM autre a WHERE a.k = d.k))::BIGINT AS retrouvees,
                    (SELECT COUNT(*) FROM autre a WHERE a.k IS NOT NULL
                        AND EXISTS (SELECT 1 FROM depart d WHERE d.k = a.k))::BIGINT AS lignes`;
            const brut = arrowResultToObjects(await conn.query(requete))[0];
            const cles = Number(brut.cles);
            const retrouvees = Number(brut.retrouvees);
            const lignes = Number(brut.lignes);
            return {
                cles,
                retrouvees,
                lignes,
                taux: cles ? retrouvees / cles : 0,
                parLigne: retrouvees ? lignes / retrouvees : 0
            };
        }

        /** Ce lien existe-t-il déjà, dans un sens ou dans l'autre ? */
        function v13LienExiste(aId, aCol, bId, bCol) {
            return (state.relations || []).some(
                r =>
                    (r.sourceTable === aId && r.sourceCol === aCol && r.targetTable === bId && r.targetCol === bCol) ||
                    (r.sourceTable === bId && r.sourceCol === bCol && r.targetTable === aId && r.targetCol === aCol)
            );
        }

        /** Le taux au-dessous duquel deux colonnes n'ont manifestement rien à voir. */
        const V13_TAUX_MINIMAL = 0.02;

        /**
         * Cherche, parmi toutes les autres tables, celles qui se rapprochent de la table de
         * départ — et dit de combien.
         */
        /** Au plus deux rapprochements par table, et douze en tout : une liste qu'on lit, pas un rapport. */
        const V13_PROPOSITIONS_PAR_TABLE = 2;
        const V13_PROPOSITIONS_MAX = 12;
        /**
         * Cherche, parmi toutes les autres sources, celles qui se rapprochent de la table de
         * départ — et dit de combien. Une lecture par table, et c'est la donnée qui classe.
         */
        async function v13ChercherDesLiens(baseId, prevenir) {
            const tableDeDepart = state.tables[baseId];
            if (!tableDeDepart) return [];
            const clesDeDepart = await v13ClesDuDepart(baseId);
            if (!clesDeDepart.length) return [];
            const tables = v13TablesARelier(baseId);
            const propositions = [];
            for (let rang = 0; rang < tables.length; rang++) {
                if (prevenir) prevenir(rang + 1, tables.length, tables[rang].name);
                let trouvees = [];
                try {
                    trouvees = await v13CroiserAvecUneTable(baseId, clesDeDepart, tables[rang]);
                } catch (e) {
                    trouvees = [];
                }
                trouvees
                    .filter(
                        p =>
                            p.mesure.taux >= V13_TAUX_MINIMAL &&
                            !v13LienExiste(baseId, p.colonneDeDepart, p.autreId, p.colonneDeLAutre)
                    )
                    .sort((x, y) => y.confiance - x.confiance)
                    .slice(0, V13_PROPOSITIONS_PAR_TABLE)
                    .forEach(p => propositions.push(p));
            }
            propositions.sort((x, y) => y.confiance - x.confiance);
            return propositions.slice(0, V13_PROPOSITIONS_MAX);
        }

        /**
         * Crée le lien et le rend utilisable sur-le-champ.
         *
         * Le sens : la table de départ est la référence, l'autre table vient s'y rattacher.
         * C'est le sens naturel d'un fichier que l'on complète.
         */
        function v13CreerLeLien(baseId, colonneDeDepart, autreId, colonneDeLAutre, mesure) {
            if (!baseId || !autreId || !colonneDeDepart || !colonneDeLAutre) return null;
            if (v13LienExiste(baseId, colonneDeDepart, autreId, colonneDeLAutre)) {
                showError('Ce lien existe déjà.');
                return null;
            }
            const lien = {
                id: 'rel_' + generateId(),
                sourceTable: autreId,
                sourceCol: colonneDeLAutre,
                targetTable: baseId,
                targetCol: colonneDeDepart,
                cardinality: mesure && mesure.parLigne > 1.0001 ? 'N-1' : '1-1',
                kind: '',
                volee: true
            };
            state.relations.push(lien);
            // Un lien qui touche un jeu temporaire ne doit pas survivre à la session : le jeu
            // lui-même n'est pas enregistré, le lien n'aurait plus de quoi se raccrocher.
            if (!v13TouchePasAuTemporaire(lien)) {
                try {
                    persistAppState();
                } catch (e) {}
            }
            return lien;
        }
        /** Vrai si l'un des deux bouts du lien est un jeu temporaire. */
        function v13TouchePasAuTemporaire(lien) {
            const estTemporaire = identifiant => typeof v12TmpIs === 'function' && v12TmpIs(identifiant);
            return estTemporaire(lien.sourceTable) || estTemporaire(lien.targetTable);
        }
        /** Retire un lien créé à la volée. */
        function v13RetirerLeLien(identifiant) {
            const lien = (state.relations || []).find(r => r.id === identifiant);
            state.relations = (state.relations || []).filter(r => r.id !== identifiant);
            if (lien && !v13TouchePasAuTemporaire(lien)) {
                try {
                    persistAppState();
                } catch (e) {}
            }
            renderAdvExtract();
        }
        /**
         * Les liens à la volée dont une extrémité a disparu (le jeu temporaire s'est envolé
         * avec la session) sont oubliés : ils ne désignent plus rien.
         */
        function v13OublierLesLiensOrphelins() {
            const avant = (state.relations || []).length;
            state.relations = (state.relations || []).filter(
                r => !r.volee || (state.tables[r.sourceTable] && state.tables[r.targetTable])
            );
            return avant - state.relations.length;
        }

        // ---- L'écran ----
        const v13Nombre = n => Number(n || 0).toLocaleString('fr-FR');
        const v13Pourcent = taux => Math.round(taux * 1000) / 10;
        /** La phrase qui dit ce que vaut un rapprochement, en français et sans jargon. */
        function v13PhraseDeLaMesure(mesure) {
            const taux = v13Pourcent(mesure.taux);
            const multiplie = mesure.parLigne > 1.0001;
            return (
                `${v13Nombre(mesure.retrouvees)} valeur(s) sur ${v13Nombre(mesure.cles)} retrouvée(s) (${taux} %)` +
                (multiplie
                    ? ` · ⚠️ ${Math.round(mesure.parLigne * 10) / 10} ligne(s) en face de chacune — ce lien peut multiplier les lignes`
                    : ' · une seule ligne en face de chacune')
            );
        }
        function v13PropositionHtml(proposition, baseId) {
            const nomDeDepart = (state.tables[baseId] || {}).name || '?';
            const mesure = proposition.mesure;
            const fort = mesure.taux >= 0.6;
            return `<div class="flex items-start gap-2 justify-between border ${fort ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'} rounded-lg px-2.5 py-1.5">
                <div class="min-w-0">
                    <div class="text-[11px] font-bold text-slate-700 truncate">${escapeHTML(nomDeDepart)}.${escapeHTML(proposition.colonneDeDepart)} ↔ ${escapeHTML(proposition.nomDeLAutre)}.${escapeHTML(proposition.colonneDeLAutre)}</div>
                    <div class="text-[10px] ${mesure.parLigne > 1.0001 ? 'text-amber-700' : 'text-slate-500'}">${escapeHTML(v13PhraseDeLaMesure(mesure))}</div>
                    <div class="text-[10px] text-slate-400">${escapeHTML(proposition.raison)}</div>
                </div>
                <button onclick="v13RelierDepuisLaProposition('${escapeHTML(proposition.autreId)}', '${escapeHTML(proposition.colonneDeDepart)}', '${escapeHTML(proposition.colonneDeLAutre)}')"
                    class="shrink-0 text-[10px] font-bold rounded-full px-2.5 py-1 bg-indigo-600 text-white hover:bg-indigo-700">🔗 Relier</button>
            </div>`;
        }
        /** Le bloc complet « Sources reliées », tel qu'il s'insère dans Extraire. */
        function v13SectionDesLiensHtml() {
            const spec = state.advExtract;
            if (!spec || !spec.baseId) return '';
            const nomDeDepart = (state.tables[spec.baseId] || {}).name || '?';
            const atteignables = typeof advReachableTables === 'function' ? advReachableTables() : [];
            const etat = v13State.liens;
            const aLaVolee = (state.relations || []).filter(
                r => r.volee && (r.sourceTable === spec.baseId || r.targetTable === spec.baseId)
            );
            let corps = `<div class="text-[11px] text-slate-600 mb-2">Depuis <b>${escapeHTML(nomDeDepart)}</b>, on peut aller chercher des colonnes dans :
                ${atteignables.length ? atteignables.map(t => `<span class="inline-block text-[10px] bg-white border border-slate-200 rounded-full px-2 py-0.5 mr-1 mb-1">${escapeHTML(t.name)}</span>`).join('') : '<i>aucune autre source — il n’y a encore aucun lien.</i>'}</div>`;
            if (aLaVolee.length)
                corps += `<div class="mb-2">${aLaVolee
                    .map(r => {
                        const autre = r.sourceTable === spec.baseId ? r.targetTable : r.sourceTable;
                        const colonneDeDepart = r.sourceTable === spec.baseId ? r.sourceCol : r.targetCol;
                        const colonneDeLAutre = r.sourceTable === spec.baseId ? r.targetCol : r.sourceCol;
                        return `<span class="inline-flex items-center gap-1 text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-full px-2 py-0.5 mr-1 mb-1">
                            🔗 ${escapeHTML(colonneDeDepart)} ↔ ${escapeHTML((state.tables[autre] || {}).name || autre)}.${escapeHTML(colonneDeLAutre)}
                            <button onclick="v13RetirerLeLien('${r.id}')" title="Retirer ce lien créé à la volée" class="text-indigo-400 hover:text-red-600 font-bold">✕</button></span>`;
                    })
                    .join('')}</div>`;
            corps += `<div class="flex items-center gap-2 flex-wrap">
                <button onclick="v13ChercherDesLiensMaintenant()" ${etat.enRecherche ? 'disabled' : ''}
                    class="text-xs font-bold rounded-lg px-3 py-1.5 border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 ${etat.enRecherche ? 'opacity-50' : ''}">
                    ${etat.enRecherche ? '⏳ Mesure en cours…' : '🔎 Chercher les liens possibles'}</button>
                <span id="v13-liens-avancement" class="text-[10px] text-slate-500">on compare les valeurs elles-mêmes, pas les noms des colonnes</span>
            </div>`;
            if (etat.message) corps += `<p class="text-[11px] text-slate-600 mt-2">${escapeHTML(etat.message)}</p>`;
            if (etat.propositions && etat.propositions.length)
                corps += `<div class="mt-2 grid gap-1.5">${etat.propositions.map(p => v13PropositionHtml(p, spec.baseId)).join('')}</div>`;
            corps += v13LienAlaMainHtml(spec.baseId);
            return corps;
        }
        /** Le lien choisi à la main, quand la recherche ne propose pas ce que l'on a en tête. */
        function v13LienAlaMainHtml(baseId) {
            const tableDeDepart = state.tables[baseId] || {};
            const autres = v13TablesARelier(baseId);
            if (!autres.length) return '';
            const choisie = v13State.liens.tableChoisie && state.tables[v13State.liens.tableChoisie];
            const autreId = choisie ? choisie.id : autres[0].id;
            const option = (valeur, libelle, selectionnee) =>
                `<option value="${escapeHTML(valeur)}" ${selectionnee ? 'selected' : ''}>${escapeHTML(libelle)}</option>`;
            return `<details class="mt-2 text-[11px]" ${v13State.liens.ouvert ? 'open' : ''} ontoggle="v13State.liens.ouvert = this.open">
                <summary class="cursor-pointer text-slate-500 hover:text-indigo-700">…ou choisir le lien moi-même</summary>
                <div class="mt-2 flex items-end gap-2 flex-wrap bg-white border border-slate-200 rounded-lg p-2">
                    <label class="text-[10px] text-slate-500">Colonne de ${escapeHTML(tableDeDepart.name || '?')}
                        <select id="v13-lien-col-depart" class="block border border-slate-300 p-1.5 rounded text-xs bg-white">
                            ${(tableDeDepart.headers || []).map(h => option(h, h, false)).join('')}</select></label>
                    <span class="pb-2 text-slate-400">↔</span>
                    <label class="text-[10px] text-slate-500">Source à relier
                        <select id="v13-lien-table" onchange="v13ChangerLaTableAlaMain(this.value)" class="block border border-slate-300 p-1.5 rounded text-xs bg-white">
                            ${autres.map(t => option(t.id, t.name + (t.temp ? ' (jeu temporaire)' : ''), t.id === autreId)).join('')}</select></label>
                    <label class="text-[10px] text-slate-500">Sa colonne
                        <select id="v13-lien-col-autre" class="block border border-slate-300 p-1.5 rounded text-xs bg-white">
                            ${((state.tables[autreId] || {}).headers || []).map(h => option(h, h, false)).join('')}</select></label>
                    <button onclick="v13RelierALaMain()" class="text-xs font-bold rounded-lg px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700">Mesurer et relier</button>
                </div>
            </details>`;
        }

        // ---- Les actions, appelées depuis l'écran ----
        async function v13ChercherDesLiensMaintenant() {
            const spec = state.advExtract;
            if (!spec || !spec.baseId) return showError('Choisissez d’abord une table de départ.');
            v13State.liens.enRecherche = true;
            v13State.liens.message = '';
            v13State.liens.propositions = null;
            renderAdvExtract();
            try {
                const propositions = await v13ChercherDesLiens(spec.baseId, (fait, total, nom) => {
                    const zone = el('v13-liens-avancement');
                    if (zone) zone.textContent = `Lecture de « ${nom} » (${fait} / ${total})…`;
                });
                v13State.liens.propositions = propositions;
                v13State.liens.message = propositions.length
                    ? `${propositions.length} rapprochement(s) trouvé(s), le meilleur en premier.`
                    : 'Aucun rapprochement trouvé : aucune colonne de cette table ne retrouve ses valeurs ailleurs. Choisissez le lien vous-même ci-dessous.';
            } catch (e) {
                v13State.liens.message = 'Recherche impossible : ' + ((e && e.message) || e);
            } finally {
                v13State.liens.enRecherche = false;
                renderAdvExtract();
            }
        }
        function v13ChangerLaTableAlaMain(identifiant) {
            v13State.liens.tableChoisie = identifiant;
            v13State.liens.ouvert = true;
            renderAdvExtract();
        }
        function v13AnnoncerLeLien(lien, mesure) {
            if (!lien) return;
            const spec = state.advExtract;
            const nomDeLAutre = (state.tables[lien.sourceTable] || {}).name || '?';
            v13State.liens.propositions = (v13State.liens.propositions || []).filter(
                p =>
                    !(
                        p.autreId === lien.sourceTable &&
                        p.colonneDeLAutre === lien.sourceCol &&
                        p.colonneDeDepart === lien.targetCol
                    )
            );
            v13State.liens.message = `🔗 Relié à « ${nomDeLAutre} ». Ses colonnes sont désormais proposées dans « Ajouter une colonne ».`;
            renderAdvExtract();
            showSuccess(
                `🔗 « ${(state.tables[spec.baseId] || {}).name || '?'} » est relié à « ${nomDeLAutre} » : ${v13PhraseDeLaMesure(mesure)}`
            );
        }
        async function v13RelierDepuisLaProposition(autreId, colonneDeDepart, colonneDeLAutre) {
            const spec = state.advExtract;
            const proposition = (v13State.liens.propositions || []).find(
                p => p.autreId === autreId && p.colonneDeDepart === colonneDeDepart && p.colonneDeLAutre === colonneDeLAutre
            );
            const mesure = proposition
                ? proposition.mesure
                : await v13MesurerUnRapprochement(spec.baseId, colonneDeDepart, autreId, colonneDeLAutre);
            const lien = v13CreerLeLien(spec.baseId, colonneDeDepart, autreId, colonneDeLAutre, mesure);
            v13AnnoncerLeLien(lien, mesure);
        }
        async function v13RelierALaMain() {
            const spec = state.advExtract;
            const colonneDeDepart = (el('v13-lien-col-depart') || {}).value;
            const autreId = (el('v13-lien-table') || {}).value;
            const colonneDeLAutre = (el('v13-lien-col-autre') || {}).value;
            if (!colonneDeDepart || !autreId || !colonneDeLAutre)
                return showError('Choisissez les deux colonnes à rapprocher.');
            let mesure;
            try {
                mesure = await v13MesurerUnRapprochement(spec.baseId, colonneDeDepart, autreId, colonneDeLAutre);
            } catch (e) {
                return showError('Mesure impossible : ' + ((e && e.message) || e));
            }
            if (!mesure.retrouvees)
                return showError(
                    `Aucune valeur commune entre ces deux colonnes (${v13Nombre(mesure.cles)} valeur(s) cherchée(s)) : le lien ne ramènerait rien. Vérifiez les colonnes choisies.`
                );
            const lien = v13CreerLeLien(spec.baseId, colonneDeDepart, autreId, colonneDeLAutre, mesure);
            v13AnnoncerLeLien(lien, mesure);
        }

        // ---- L'insertion dans l'écran d'Extraire ----
        Studio.extend(
            'renderAdvExtract',
            base =>
                function () {
                    const resultat = base.apply(this, arguments);
                    try {
                        v13OublierLesLiensOrphelins();
                        const corps = v13SectionDesLiensHtml();
                        if (!corps) return resultat;
                        const colonnes = document.querySelector('.v12x-sec[data-sec="cols"]');
                        if (!colonnes || colonnes.parentNode.querySelector('[data-sec="liens"]')) return resultat;
                        const section = document.createElement('section');
                        section.className = 'v12x-sec';
                        section.setAttribute('data-sec', 'liens');
                        section.innerHTML =
                            `<div class="v12x-h"><span class="ic">🔗</span><div><b>Sources reliées</b><span class="sub">où l’on peut aller chercher des colonnes — et comment s’y rattacher</span></div>
                                </div>` + `<div class="v12x-body">${corps}</div>`;
                        colonnes.parentNode.insertBefore(section, colonnes);
                    } catch (e) {}
                    return resultat;
                },
            { motif: 'relier une source à la volée, depuis Extraire' }
        );
