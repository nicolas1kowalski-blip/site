        // ======================= V13 : VOCABULAIRE MÉTIER ET PHRASE D'AIDE PAR ÉCRAN =======================
        // Les mots techniques deviennent des mots de métier dans les écrans de gouvernance ; le mot technique
        // reste au survol. Une phrase en tête de chaque écran dit ce qu'on y fait et pourquoi.
        const v13State = { helpOff: {}, domain: '' };
        try {
            const s = localStorage.getItem('sd_v13');
            if (s) Object.assign(v13State, JSON.parse(s));
        } catch (e) {}
        function v13Save() {
            try {
                localStorage.setItem('sd_v13', JSON.stringify({ helpOff: v13State.helpOff, domain: v13State.domain }));
            } catch (e) {}
        }
        Object.assign(V11_WORDS, {
            'Attribut': 'Information',
            'Attributs': 'Informations',
            'attribut': 'information',
            'attributs': 'informations',
            "Attributs de l'objet": "Informations de l'objet",
            'Attribut propre': 'Information propre',
            '+ Attribut': '+ Information',
            'Facette': 'Variante',
            'Facettes': 'Variantes',
            'Nouveau composant (facette)': 'Nouvelle variante',
            'Lineage': 'Parcours de la donnée',
            'Graphe de bout en bout': 'Parcours de bout en bout',
            'Provenance (alimenté par)': "D'où ça vient",
            'Usages — qui utilise cet attribut': "Qui s'en sert",
            'Sens métier': "C'est quoi",
            'Colonne technique': 'Colonne du fichier',
            'colonne technique': 'colonne du fichier',
            'Table technique': 'Fichier',
            'Nom en sortie (alias métier)': 'Nom dans le résultat',
            'Objets métier': 'Objets métier',
            'Cardinalité': 'Combien de fois',
            'Sensibilité': 'Confidentialité'
        });
        // libellés du menu
        try {
            const gov = NAV_PHASES.find(p => p.id === 'gov');
            if (gov)
                gov.tabs.forEach(t => {
                    if (t.g === 'flow') t.label = 'Parcours de la donnée';
                    if (t.g === 'lineage') t.label = 'Parcours de bout en bout';
                    if (t.g === 'assets') t.label = 'Applications & restitutions';
                    if (t.g === 'privacy') t.label = 'Confidentialité';
                });
        } catch (e) {}
        const V13_HELP = {
            home: [
                '🏠',
                "Ici, vous voyez où en est la description de vos données et ce qu'il reste à faire.",
                "Posez une question, ou partez d'un fichier : l'application propose, vous validez."
            ],
            objects: [
                '🏛️',
                'Ici, vous dites à quoi ressemble une chose que vous gérez (un Client, un Contrat…) et qui en est responsable.',
                "Pour chaque information, trois questions : c'est quoi, d'où ça vient, qui s'en sert."
            ],
            dictionary: [
                '📚',
                'Ici, chaque colonne de vos fichiers reçoit un nom compréhensible et une définition.',
                'Le dictionnaire est ce que lira un collègue qui découvre la donnée.'
            ],
            glossary: [
                '📖',
                "Ici, vous fixez les mots du métier et ce qu'ils veulent dire, une bonne fois pour toutes.",
                'Un mot du glossaire se pose ensuite comme une étiquette sur les informations concernées.'
            ],
            assets: [
                '🖥',
                "Ici, vous listez les applications qui produisent la donnée, les processus qui l'utilisent et les restitutions qui en sortent.",
                "C'est ce qui permet de répondre à « d'où ça vient » et « qui s'en sert »."
            ],
            flow: [
                '🕸️',
                "Ici, vous suivez la donnée de bout en bout : de l'application qui la crée jusqu'au rapport qui la montre.",
                "Cliquez un élément pour isoler sa chaîne ; les groupes s'ouvrent d'un clic."
            ],
            lineage: [
                '🕸️',
                "Ici, vous suivez la donnée de bout en bout : de l'application qui la crée jusqu'au rapport qui la montre.",
                "Cliquez un élément pour isoler sa chaîne ; les groupes s'ouvrent d'un clic."
            ],
            catalog: [
                '🧭',
                'Ici, vous cherchez une donnée comme dans un annuaire : par mot, par domaine, par responsable.',
                'Chaque résultat mène à sa fiche.'
            ],
            model: [
                '🧬',
                'Ici, vous voyez comment vos fichiers se relient entre eux.',
                'Un lien = une clé commune entre deux fichiers.'
            ],
            people: [
                '👥',
                'Ici, vous dites qui est responsable de quel domaine, et qui peut proposer des modifications.',
                'Un propriétaire valide, un contributeur propose.'
            ],
            review: [
                '✅',
                'Ici, vous validez ou refusez les corrections proposées par vos collègues.',
                "Rien n'est écrasé avant votre décision."
            ],
            privacy: [
                '🔐',
                'Ici, vous repérez les données personnelles et sensibles pour les protéger.',
                'Une information marquée « personnelle » est signalée partout où elle apparaît.'
            ],
            vlists: [
                '🎚️',
                'Ici, vous décrivez les codes et leur signification (ex. « A = Actif »).',
                'Utile pour que tout le monde lise les mêmes valeurs de la même façon.'
            ],
            perimeters: [
                '🧩',
                'Ici, vous regroupez des fichiers par sujet ou par équipe.',
                'Un périmètre sert de filtre ailleurs.'
            ],
            history: ['🕓', 'Ici, vous retrouvez les audits de qualité passés et leur évolution.', ''],
            srcwatch: [
                '📡',
                'Ici, vous surveillez les fichiers que vous recevez : sont-ils à jour, et ressemblent-ils à ceux d’hier ?',
                'Une livraison qui arrive en retard, qui perd une colonne ou qui change de volume se voit tout de suite.'
            ]
        };
        /*
         * Le vocabulaire métier AU MILIEU des phrases.
         *
         * v11Wording ne remplace un texte que s'il est exactement égal à un terme : « Attribut » tout seul
         * devient « Information », mais « Attributs désignés » ou « Tables techniques (2) » restaient tels
         * quels — et l'on lisait les deux vocabulaires sur le même écran.
         *
         * On n'échange pas les mots un par un : « attribut » est masculin, « information » féminine, et
         * « un attribut rattaché » deviendrait « un information rattaché ». On écrit donc les tournures
         * entières, déjà accordées. La liste est courte à dessein : ce sont les étiquettes qui choquent.
         */
        const V13_TOURNURES = [
            ['Tables techniques', 'Fichiers'],
            ['Table technique', 'Fichier'],
            ['Attributs désignés', 'Informations désignées'],
            ['Attributs rattachés', 'Informations rattachées'],
            ['Rattacher un attribut', 'Rattacher une information'],
            ['Lier un terme à un attribut', 'Lier un terme à une information'],
            ['Aucun attribut', 'Aucune information'],
            ['aucun attribut', 'aucune information'],
            ['attribut(s) rattaché(s)', 'information(s) rattachée(s)'],
            ['Pas encore rattachée à un attribut', 'Pas encore rattachée à une information'],
            ['Regroupez vos tables par domaine métier', 'Regroupez vos fichiers par domaine métier'],
            ['Table de référence', 'Fichier de référence'],
            ['— table —', '— fichier —'],
            // Confidentialité : ce que fait la règle, pas le nom savant de la technique.
            ['pseudonymisation (jeton stable salé)', 'remplacé par un code'],
            ['masquage (1er caractère + •••)', 'masqué, sauf la 1re lettre'],
            ['généralisation (tranches / année)', 'arrondi (tranche ou année)'],
            ['suppression de la colonne', 'colonne retirée'],
            ['aucune (en clair)', 'laissé tel quel'],
            ['Exporter le jeu anonymisé + rapport', 'Exporter le fichier anonymisé et son rapport'],
            // Surveillance des sources : un instantané est une photo, une dérive est un changement.
            ['Moniteur & fraîcheur', 'Est-ce à jour ?'],
            ['Contrat de données', 'Colonnes attendues'],
            ['Changements (delta)', 'Ce qui a changé'],
            ['Réconciliation', 'Deux fichiers face à face'],
            ['Prendre un instantané', 'Prendre une photo'],
            ['instantané(s)', 'photo(s)'],
            [
                'Prenez deux instantanés (à deux chargements) pour mesurer la dérive.',
                'Prenez une photo à deux chargements différents pour voir ce qui a changé entre les deux.'
            ],
            ['⚠ dérive de schéma', '⚠ les colonnes ont changé'],
            ['schéma stable', 'mêmes colonnes qu’avant'],
            [
                'Chargez au moins une source (onglet Sources) pour suivre sa fraîcheur, sa dérive, son contrat et ses changements.',
                'Chargez au moins un fichier (onglet Sources) pour savoir s’il arrive à l’heure et ce qui y change.'
            ]
        ];
        function v13TournuresMetier(root) {
            if (!root) return;
            const promeneur = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const aChanger = [];
            while (promeneur.nextNode()) {
                const noeud = promeneur.currentNode;
                const parent = noeud.parentNode;
                // Ni le code, ni les styles, ni ce que l'utilisateur est en train de taper.
                if (parent && /^(SCRIPT|STYLE|TEXTAREA)$/.test(parent.nodeName)) continue;
                let texte = noeud.nodeValue;
                V13_TOURNURES.forEach(paire => {
                    if (texte.indexOf(paire[0]) !== -1) texte = texte.split(paire[0]).join(paire[1]);
                });
                if (texte !== noeud.nodeValue) aChanger.push([noeud, texte]);
            }
            aChanger.forEach(paire => {
                paire[0].nodeValue = paire[1];
            });
        }
        function v13HelpBand(tab) {
            const h = V13_HELP[tab];
            if (!h || v13State.helpOff[tab]) return '';
            return `<div class="v13-help" data-ro="keep"><span class="ic">${h[0]}</span><div><b>${escapeHTML(h[1])}</b>${h[2] ? '<br>' + escapeHTML(h[2]) : ''}</div>
                <button class="x" title="Ne plus afficher sur cet écran" onclick="v13State.helpOff['${tab}']=true; v13Save(); this.parentNode.remove()">✕</button></div>`;
        }
        Studio.extend(
            'renderGovernance',
            base =>
                function () {
                    const result = base.apply(this, arguments);
                    try {
                        const govContentElement = el('govContent');
                        const tab = govState.tab;
                        if (!govContentElement || govContentElement.querySelector('.v13-help')) return result;
                        const band = v13HelpBand(tab);
                        if (!band) return result;
                        /*
                         * En TÊTE de l'écran, toujours.
                         *
                         * On la posait avant la barre de liste quand il y en avait une. Sur le glossaire,
                         * cette barre vient après le titre, la phrase d'explication et le bouton : la phrase
                         * d'aide tombait donc au milieu de l'écran, alors qu'elle est là pour accueillir.
                         */
                        govContentElement.insertAdjacentHTML('afterbegin', band);
                        v13TournuresMetier(govContentElement);
                    } catch (e) {}
                    return result;
                }
        );
        // vocabulaire métier aussi dans le texte HTML généré (impression d'une fiche, dossier de gouvernance)
        function v13WordsHtml(html) {
            return String(html || '').replace(/>([^<>]+)</g, (m, t) => {
                const k = t.trim();
                const w = V11_WORDS[k];
                return w ? '>' + t.replace(k, w) + '<' : m;
            });
        }
        Studio.extend(
            'v11Print',
            base =>
                function () {
                    const result = base.apply(this, arguments);
                    try {
                        const area = el('v11PrintArea');
                        if (area) {
                            v11Wording(area);
                            area.innerHTML = v13WordsHtml(area.innerHTML);
                        }
                    } catch (e) {}
                    return result;
                }
        );
        if (typeof exportGovernanceReport === 'function' && typeof v12WithBlobHook === 'function') {
            Studio.extend(
                'exportGovernanceReport',
                base =>
                    function () {
                        const args = arguments;
                        return v12WithBlobHook(() => base.apply(this, args), v13WordsHtml);
                    }
            );
        }
        Object.assign(V11_LEXIQUE, {
            'information':
                "Un renseignement élémentaire sur un objet (ex. la date de naissance d'un client). Terme technique : attribut.",
            'variante':
                "Une forme particulière d'un objet, avec ses propres informations (ex. Client particulier / Client entreprise). Terme technique : facette.",
            'parcours de la donnée':
                "D'où vient la donnée et où elle va : application qui la crée, fichiers, objets, restitutions, destinataires. Terme technique : lineage.",
            'colonne du fichier':
                "La colonne d'un fichier chargé qui porte réellement la valeur d'une information. Terme technique : mapping.",
            'responsable':
                "La personne qui répond de la qualité et de la définition d'une donnée, et qui valide les modifications. Terme technique : propriétaire / owner.",
            'restitution': 'Ce qui sort des données : rapport, tableau de bord, fichier réglementaire, extraction livrée.'
        });
