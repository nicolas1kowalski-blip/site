        // ======================= COUCHE SERVEUR : VERSION, PASTILLE D'ÉTAT, LEXIQUE =======================
        // La version applicative (APP_VERSION) reste celle des sources assemblées ; SERVEUR_VERSION identifie la
        // couche client/serveur, affichée dans l'en-tête avec l'état de la connexion et la version de DuckDB.
        const SERVEUR_VERSION = '1.0.0';

        function serveurRafraichirPastille() {
            const pastille = el('sdServeurChip');
            if (!pastille) return;
            const sante = window.__serveurSante;
            const horsLigne = serveurEnLigne === false;
            pastille.classList.toggle('sd-hors-ligne', horsLigne);
            pastille.innerHTML =
                '<span class="sd-dot"></span> ' +
                (horsLigne
                    ? 'serveur injoignable'
                    : 'serveur' + (sante && sante.duckdb ? ' · DuckDB ' + escapeHTML(sante.duckdb) : ''));
            pastille.title = horsLigne
                ? 'Le serveur ne répond plus : les actions échoueront jusqu’à son retour.'
                : 'Version client/serveur ' +
                  SERVEUR_VERSION +
                  (sante ? ' — serveur ' + sante.serveur + ', espace « ' + sante.espace + ' »' : '') +
                  '. Les calculs SQL et les données sont sur le serveur.';
        }
        function serveurInstallerPastille() {
            const enTete = document.querySelector('.v7-top .ml-auto');
            if (!enTete || el('sdServeurChip')) return;
            const pastille = document.createElement('span');
            pastille.id = 'sdServeurChip';
            pastille.className = 'sd-serveur-chip';
            enTete.insertBefore(pastille, enTete.firstChild);
            serveurRafraichirPastille();
            window.__duckdbPromise.then(serveurRafraichirPastille);
        }
        document.addEventListener('DOMContentLoaded', () => {
            try {
                serveurInstallerPastille();
            } catch (e) {}
        });

        Object.assign(V11_LEXIQUE, {
            'version serveur':
                'Même application, mais le moteur SQL (DuckDB natif) et les données tournent sur un serveur : les fichiers sont déposés une fois, les tables persistent, l’ouverture est instantanée et plusieurs postes partagent le même espace de travail.'
        });
