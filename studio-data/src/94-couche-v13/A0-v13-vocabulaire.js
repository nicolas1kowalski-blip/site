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
            history: ['🕓', 'Ici, vous retrouvez les audits de qualité passés et leur évolution.', '']
        };
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
                        const element = govContentElement.querySelector('.v11-listbar');
                        const first = govContentElement.firstElementChild;
                        if (element) element.insertAdjacentHTML('beforebegin', band);
                        else if (first) first.insertAdjacentHTML('beforebegin', band);
                        else govContentElement.insertAdjacentHTML('afterbegin', band);
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
