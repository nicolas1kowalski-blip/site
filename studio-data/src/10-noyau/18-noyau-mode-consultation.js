        /* ==================== MODE CONSULTATION DE LA GOUVERNANCE ====================
           Beaucoup de gens ouvrent la gouvernance pour LIRE : comprendre ce qui a été défini,
           relire des définitions, préparer un avis. Aujourd'hui chaque champ de saisie les invite
           à écrire, et une modification par mégarde ne se voit pas.
           Cette bascule masque toutes les commandes de modification de la Gouvernance. Elle laisse
           intactes celles qui servent à LIRE : navigation entre écrans, recherche du catalogue,
           choix de l'objet ou de la table, onglets d'une fiche, zoom et recentrage des graphes,
           aperçus et exports.
           Ce que ce n'est PAS : une sécurité. N'importe qui peut décocher la case, et l'application
           est un fichier unique lisible. C'est un garde-fou contre la modification accidentelle,
           et un mode de démonstration — rien de plus, et le bandeau le dit.
           Portée : la Gouvernance seulement. Charger une source, extraire, analyser restent
           disponibles ; ces écrans ne touchent pas au référentiel. */
        const GOV_RO_SCOPE = ['step-9', 'uxDrawer'];
        /* En consultation, restent tous les écrans qui PRÉSENTENT le référentiel : catalogue,
           dictionnaire, modèle de données, objets métier, applications & processus, glossaire,
           listes de valeurs, lineage, historique — leurs commandes d'écriture sont masquées mais
           leur contenu se lit. Sont retirés les seuls écrans d'ADMINISTRATION, qui ne sont que des
           postes de travail : Périmètres, Sensibilité (classification/anonymisation) et
           Surveillance des sources — privés de leurs commandes ils ne disent plus rien, et leur
           présence ferait chercher au lecteur des choses qu'il ne peut pas faire. */
        const GOV_RO_TABS = [
            'catalog',
            'dictionary',
            'model',
            'objects',
            'assets',
            'glossary',
            'vlists',
            'flow',
            'lineage',
            'history',
            'review',
            'people'
        ];
        function govTabAllowed(g) {
            return !govIsReadOnly() || GOV_RO_TABS.includes(g);
        }
        function govVisibleTabs(tabs) {
            return (tabs || []).filter(t => !t.hidden && govTabAllowed(t.g));
        }
        function govIsReadOnly() {
            return !!govState.readOnly;
        }
        function govSetReadOnly(on) {
            govState.readOnly = !!on;
            if (!govTabAllowed(govState.tab)) govState.tab = GOV_RO_TABS[0];
            govApplyReadOnly();
            renderNav();
            renderGovernance();
            govProjectValues();
        }
        /* Masquer une commande de saisie masque aussi SA VALEUR — or le lecteur vient
           précisément pour lire ce qui a été renseigné. On projette donc, pour chaque champ
           masqué qui porte une valeur, un texte à sa place. Un champ vide ne produit rien :
           inutile d'encombrer la lecture avec ce qui n'a pas été rempli. */
        function govRoDisplayValue(n) {
            if (n.tagName.toLowerCase() === 'select') {
                const element = n.options[n.selectedIndex];
                const t = element ? (element.textContent || '').trim() : '';
                return !t || t.charAt(0) === '\u2014' || t.charAt(0) === '(' ? '' : t;
            }
            if (n.type === 'checkbox' || n.type === 'radio') return n.checked ? '\u2713' : '';
            if (n.type === 'file') return '';
            return String(n.value || '').trim();
        }
        function govProjectValues() {
            document.querySelectorAll('.gov-ro-val').forEach(x => x.remove());
            if (!govIsReadOnly()) return;
            GOV_RO_SCOPE.forEach(id => {
                const root = el(id);
                if (!root || !root.hasAttribute('data-gov-ro')) return;
                root.querySelectorAll('input,select,textarea').forEach(n => {
                    if (n.closest('[data-ro="keep"]')) return;
                    if (getComputedStyle(n).display !== 'none') return;
                    const v = govRoDisplayValue(n);
                    if (!v) return;
                    const spanElement = document.createElement('span');
                    spanElement.className = 'gov-ro-val';
                    spanElement.textContent = v;
                    n.insertAdjacentElement('afterend', spanElement);
                });
            });
        }
        function govApplyReadOnly() {
            const on = govIsReadOnly();
            GOV_RO_SCOPE.forEach(id => {
                const element = el(id);
                if (!element) return;
                if (on) element.setAttribute('data-gov-ro', '1');
                else element.removeAttribute('data-gov-ro');
            });
            const chk = el('govRoChk');
            if (chk) chk.checked = on;
            const band = el('govRoBand');
            if (band) {
                band.classList.toggle('hidden', !on);
                band.innerHTML = on
                    ? `<div class="gov-ro-band">
                    <span class="font-black">👁 Mode consultation</span>
                    <span>Les écrans qui présentent le référentiel restent consultables, commandes de modification masquées. Trois écrans d'administration sont retirés : <b>Périmètres</b>, <b>Sensibilité</b> et <b>Surveillance des sources</b>.</span>
                    <span class="text-indigo-500">Ce n’est pas une sécurité — la case se décoche.</span>
                    <button data-ro="keep" onclick="govSetReadOnly(false)" style="background:#4f46e5;color:#fff" class="ml-auto text-[11px] font-bold px-3 py-1.5 rounded-lg">Reprendre la main</button>
                </div>`
                    : '';
            }
        }
