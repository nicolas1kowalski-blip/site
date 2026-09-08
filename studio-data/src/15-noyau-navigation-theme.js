        // ---- Navigation à 2 niveaux : 4 phases (parcours) -> sous-onglets ----
        // Les numéros d'étape (step-N) restent inchangés : on ne fait que regrouper et réordonner
        // visuellement. switchTab(num) reste l'unité atomique « afficher l'étape N ».
        const NAV_PHASES = [
            { id: 'data', badge: '①', label: 'Données & Modèle', desc: 'Charger & modéliser', color: 'blue',
              tabs: [ { n: 11, icon: '🏠', label: 'Cockpit' }, { n: 1, icon: '📥', label: 'Sources' }, { n: 10, icon: '🧱', label: 'Tables' }, { n: 2, icon: '🔗', label: 'Modèle de données' }, { n: 16, icon: '📈', label: 'Séries temporelles' } ] },
            { id: 'etl', badge: '②', label: 'Exploitation', desc: 'ETL, croisements & analyse', color: 'indigo',
              tabs: [ { n: 3, icon: '⚗️', label: 'Extraire' }, { n: 13, icon: '🧹', label: 'Préparation' }, { n: 14, icon: '📋', label: 'Tableaux de bord' }, { n: 7, icon: '⚖️', label: 'Comparer' }, { n: 6, icon: '🔎', label: 'Explorer' }, { n: 4, icon: '📊', label: 'Statistiques' }, { n: 5, icon: '🕸️', label: 'Explorateur 360°' } ] },
            { id: 'quality', badge: '③', label: 'Qualité & Audit', desc: 'Profiling, anomalies, doublons', color: 'amber',
              tabs: [ { n: 8, icon: '✅', label: 'Qualité & Audit' }, { n: 12, icon: '📏', label: 'Règles & score' }, { n: 15, icon: '🤝', label: 'Rapprochement' } ] },
            // La phase Gouvernance vit dans l'écran 9 : ses sous-onglets (g:...) sont rendus dans la
            // MÊME barre que ceux des autres phases, et pilotent govState.tab au lieu d'un numéro d'écran.
            { id: 'gov', badge: '④', label: 'Gouvernance', desc: 'Objets, dictionnaire, lineage', color: 'emerald', step: 9, icon: '📚',
              tabs: [
                  // Modèle clair (R4) : 6 familles alignées sur les 3 plans (physique / acteurs / sens
                  // métier) + Lineage, Contrôle. Vocabulaire unifié : Table / Application / Objet.
                  // V6.12 : « Découvrir » (le catalogue) est le POINT D'ENTRÉE — on commence par
                  // chercher la donnée disponible, puis on descend vers le patrimoine et le détail.
                  { g: 'catalog', icon: '🧭', label: 'Catalogue', fam: 'Découvrir' },
                  { g: 'dictionary', icon: '📚', label: 'Dictionnaire', fam: 'Patrimoine' },
                  { g: 'model', icon: '🧬', label: 'Modèle de données', fam: 'Patrimoine' },
                  { g: 'assets', icon: '🖥', label: 'Applications & processus', fam: 'Acteurs' },
                  { g: 'objects', icon: '🏛️', label: 'Objets métier', fam: 'Sens métier' },
                  { g: 'glossary', icon: '📖', label: 'Glossaire', fam: 'Sens métier' },
                  { g: 'vlists', icon: '🎚️', label: 'Listes de valeurs', fam: 'Sens métier' },
                  { g: 'perimeters', icon: '🧩', label: 'Périmètres', fam: 'Sens métier' },
                  { g: 'privacy', icon: '🔐', label: 'Sensibilité', fam: 'Sens métier' },
                  { g: 'flow', icon: '🕸️', label: 'Lineage', fam: 'Lineage' },
                  { g: 'lineage', icon: '🕸️', label: 'Graphe de bout en bout', fam: 'Lineage', hidden: true },
                  { g: 'srcwatch', icon: '🛰️', label: 'Surveillance des sources', fam: 'Contrôle' },
                  { g: 'history', icon: '📈', label: 'Historique', fam: 'Contrôle' },
              ] },
        ];
        const PHASE_COLORS = {
            blue:    { on: 'bg-blue-600 text-white shadow-md shadow-blue-600/20',       off: 'bg-blue-50 text-blue-700 hover:bg-blue-100',          sub: 'text-blue-700 border-blue-500',       subDot: 'bg-blue-100 text-blue-700' },
            indigo:  { on: 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20',   off: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',    sub: 'text-indigo-700 border-indigo-500',   subDot: 'bg-indigo-100 text-indigo-700' },
            amber:   { on: 'bg-amber-500 text-white shadow-md shadow-amber-500/20',     off: 'bg-amber-50 text-amber-700 hover:bg-amber-100',       sub: 'text-amber-700 border-amber-500',     subDot: 'bg-amber-100 text-amber-700' },
            emerald: { on: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20', off: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100', sub: 'text-emerald-700 border-emerald-500', subDot: 'bg-emerald-100 text-emerald-700' },
        };
        let currentTab = 1;
        function phaseOfTab(num) { return NAV_PHASES.find(p => p.step === num || p.tabs.some(t => t.n === num)) || NAV_PHASES[0]; }
        function switchPhase(pid) { const p = NAV_PHASES.find(x => x.id === pid); if (!p) return; const f = p.tabs[0]; if (f.n) switchTab(f.n); else openGovTab(f.g); }
        // Ouvre un sous-onglet Gouvernance depuis la barre de navigation commune.
        function openGovTab(g) {
            if (!govTabAllowed(g)) g = GOV_RO_TABS[0];
            govState.tab = g;
            // À l'ouverture du Lineage, la carte « Vue systèmes » est resynchronisée en silence avec les
            // données (tables conçues + applications) — comme la vue « Bout en bout » l'est en direct —
            // pour que les deux vues reflètent toujours les mêmes faits. Réglages manuels préservés.
            if (g === 'flow' || g === 'lineage') { try { lfSyncFromData({ silent: true }); } catch (e) { } }
            if (currentTab !== 9) switchTab(9); // switchTab rend la gouvernance + la nav
            else { renderGovernance(); renderNav(); }
        }
        // ===================== V7 : NAVIGATION EN RAIL LATÉRAL =====================
        // Les phases deviennent des groupes dépliables, les écrans des entrées. La barre du haut
        // ne porte plus que le titre de l'écran courant et, pour la gouvernance, ses familles.
        /* ============================================================================
           V7.1 — Icônes vectorielles
           Les émojis étaient le trait le plus daté de l'interface : rendus par le
           système, ils changent d'un poste à l'autre, refusent la couleur du texte
           et jurent avec une typographie soignée. On les remplace, là où ils
           structurent la navigation, par des tracés d'un poids unique qui héritent
           de la couleur courante. La table est indexée par l'émoji d'origine : les
           écrans n'ont rien à déclarer, et tout émoji non couvert reste affiché
           tel quel — aucune icône ne peut disparaître.
           ============================================================================ */
        const V7_ICONS = {
            '🏠': '<path d="M3 10.7 12 3.5l9 7.2"/><path d="M5.6 9.4V20a.8.8 0 0 0 .8.8h11.2a.8.8 0 0 0 .8-.8V9.4"/><path d="M9.8 20.8v-6h4.4v6"/>',
            '📥': '<path d="M12 3.5v10.7"/><path d="M8 10.3 12 14.2l4-3.9"/><path d="M4 15.5v3.2a1.8 1.8 0 0 0 1.8 1.8h12.4a1.8 1.8 0 0 0 1.8-1.8v-3.2"/>',
            '🧱': '<rect x="3.2" y="4.5" width="17.6" height="15" rx="2.2"/><path d="M3.2 9.6h17.6M3.2 14.5h17.6M9.5 9.6v4.9M15 4.6v5M15 14.5v5"/>',
            '🔗': '<path d="M10.2 13.8a3.8 3.8 0 0 0 5.6.3l2.6-2.6a3.8 3.8 0 0 0-5.4-5.4l-1.5 1.5"/><path d="M13.8 10.2a3.8 3.8 0 0 0-5.6-.3l-2.6 2.6a3.8 3.8 0 0 0 5.4 5.4l1.5-1.5"/>',
            '⚗️': '<path d="M3.8 4.8h16.4l-6.5 7.7v6.3l-3.4 2.1v-8.4z"/>',
            '🧹': '<path d="M4 20 14.2 9.8"/><path d="M16.6 3.4l.85 2.05 2.05.85-2.05.85-.85 2.05-.85-2.05-2.05-.85 2.05-.85z"/><path d="M6.4 4.2l.55 1.3 1.3.55-1.3.55L6.4 7.9l-.55-1.3-1.3-.55 1.3-.55z"/>',
            '📋': '<rect x="3.2" y="4" width="7.4" height="7.2" rx="1.8"/><rect x="13.4" y="4" width="7.4" height="4.6" rx="1.8"/><rect x="3.2" y="14" width="7.4" height="6" rx="1.8"/><rect x="13.4" y="11.4" width="7.4" height="8.6" rx="1.8"/>',
            '⚖️': '<path d="M12 4.2v16"/><path d="M6 7.6h12"/><path d="M6.2 7.7 3.4 14h5.6z"/><path d="M17.8 7.7 15 14h5.6z"/><path d="M8 20.4h8"/>',
            '🔎': '<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.4 15.4 20.4 20.4"/>',
            '📊': '<path d="M4.6 20.2v-7.4"/><path d="M9.9 20.2V6.6"/><path d="M15.2 20.2v-5.4"/><path d="M20.5 20.2V9.4"/>',
            '📈': '<path d="M4 16.4 9.4 11l3.4 3.4 6.8-6.8"/><path d="M15.6 7.6h4v4"/>',
            '🕸️': '<circle cx="12" cy="5.4" r="2.3"/><circle cx="5.2" cy="17.4" r="2.3"/><circle cx="18.8" cy="17.4" r="2.3"/><path d="M10.7 7.5 6.5 15.3M13.3 7.5l4.2 7.8M7.5 17.4h9"/>',
            '✅': '<circle cx="12" cy="12" r="8.4"/><path d="M8.3 12.2l2.6 2.6 4.9-5.2"/>',
            '📏': '<rect x="2.8" y="8.2" width="18.4" height="7.6" rx="1.8"/><path d="M7 8.4v2.8M11 8.4v4.2M15 8.4v2.8M19 8.4v4.2"/>',
            '🤝': '<path d="M4 5.4v3.4a4 4 0 0 0 4 4h8a4 4 0 0 1 4 4v2"/><path d="M20 5.4v3.4a4 4 0 0 1-4 4"/><path d="M17.4 16.4 20 19l2.4-2.4" transform="translate(-2.4 0)"/>',
            '📚': '<path d="M4 5.2A1.6 1.6 0 0 1 5.6 3.6h4.2A2.2 2.2 0 0 1 12 5.8v13a1.9 1.9 0 0 0-1.9-1.9H4z"/><path d="M20 5.2a1.6 1.6 0 0 0-1.6-1.6h-4.2A2.2 2.2 0 0 0 12 5.8v13a1.9 1.9 0 0 1 1.9-1.9H20z"/>',
            '🧭': '<circle cx="12" cy="12" r="8.4"/><path d="M15.2 8.8l-1.9 4.5-4.5 1.9 1.9-4.5z"/>',
            '🏛️': '<path d="M3.4 9.5 12 4.2l8.6 5.3"/><path d="M5.8 10v8.2M10 10v8.2M14 10v8.2M18.2 10v8.2"/><path d="M3.4 20.4h17.2"/>',
            '🖥': '<rect x="2.8" y="4.2" width="18.4" height="12.2" rx="2"/><path d="M9 20.4h6M12 16.6v3.8"/>',
            '📖': '<path d="M12 6.4S10 4.4 4.6 4.4v13.2C10 17.6 12 19.6 12 19.6s2-2 7.4-2V4.4C14 4.4 12 6.4 12 6.4z"/><path d="M12 6.4v13.2"/>',
            '🧩': '<path d="M9.6 4.4h4.8v1.9a1.85 1.85 0 1 0 3.7 0V4.4h1.5v5h-1.9a1.85 1.85 0 1 0 0 3.7h1.9v6.5h-5v-1.9a1.85 1.85 0 1 0-3.7 0v1.9h-6.5v-6.5h1.9a1.85 1.85 0 1 0 0-3.7H4.4v-5h5.2z"/>',
            '🧬': '<circle cx="5.6" cy="6.4" r="2.1"/><circle cx="5.6" cy="17.6" r="2.1"/><circle cx="18.4" cy="12" r="2.1"/><path d="M7.7 6.9 16.4 11.2M7.7 17.1l8.7-4.3"/>',
            '🎚️': '<path d="M4 8.4h9.9M18.1 8.4H20M4 15.6h3.9M12.1 15.6H20"/><circle cx="16" cy="8.4" r="2.1"/><circle cx="10" cy="15.6" r="2.1"/>',
            '🔐': '<rect x="4.6" y="10.2" width="14.8" height="10" rx="2.2"/><path d="M8.2 10.2V7.6a3.8 3.8 0 0 1 7.6 0v2.6"/>',
            '🛰️': '<circle cx="12" cy="12" r="2.2"/><path d="M12 4.2a7.8 7.8 0 0 1 7.8 7.8M12 7.8a4.2 4.2 0 0 1 4.2 4.2"/><path d="M4.4 12a7.6 7.6 0 0 0 7.6 7.6"/>',
            '🚨': '<path d="M12 3.6a4.6 4.6 0 0 0-4.6 4.6v5.2H16.6V8.2A4.6 4.6 0 0 0 12 3.6z"/><path d="M4.6 13.4h14.8v2.2H4.6z"/><path d="M8.6 15.6v2.4a3.4 3.4 0 0 0 6.8 0v-2.4"/>',
            '⚠️': '<path d="M12 4.2 21 19.2H3z"/><path d="M12 9.8v4.2M12 16.9v.1"/>',
            '📄': '<path d="M13.6 3.8H7.2a1.8 1.8 0 0 0-1.8 1.8v12.8a1.8 1.8 0 0 0 1.8 1.8h9.6a1.8 1.8 0 0 0 1.8-1.8V8.6z"/><path d="M13.6 3.8v4.8h5"/>',
            '📦': '<path d="M20.4 8.4 12 4.2 3.6 8.4v7.2L12 19.8l8.4-4.2z"/><path d="M3.6 8.4 12 12.6l8.4-4.2M12 12.6v7.2"/>',
            '⚙️': '<circle cx="12" cy="12" r="3.1"/><path d="M19.2 14.2a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.06-.06a1.6 1.6 0 0 0-2.72 1.14v.17a1.9 1.9 0 1 1-3.8 0v-.09a1.6 1.6 0 0 0-2.78-1.06l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.06A1.6 1.6 0 0 0 4.8 14.2h-.17a1.9 1.9 0 1 1 0-3.8h.09A1.6 1.6 0 0 0 5.78 7.6l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.06.06A1.6 1.6 0 0 0 11.2 4.8v-.17a1.9 1.9 0 1 1 3.8 0v.09a1.6 1.6 0 0 0 2.72 1.14l.06-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.06a1.6 1.6 0 0 0 1.14 2.72h.17a1.9 1.9 0 1 1 0 3.8h-.09z"/>',
            '🌳': '<path d="M12 20.4v-5.6"/><path d="M12 14.8a5.4 5.4 0 0 0 5.4-5.4A5.4 5.4 0 0 0 12 4a5.4 5.4 0 0 0-5.4 5.4 5.4 5.4 0 0 0 5.4 5.4z"/><path d="M8.6 20.4h6.8"/>',
            '👁️': '<path d="M2.6 12S6 5.6 12 5.6 21.4 12 21.4 12 18 18.4 12 18.4 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.8"/>',
            '🔄': '<path d="M20.2 11.2a8.2 8.2 0 0 0-14-4.4L3.8 9.2"/><path d="M3.8 12.8a8.2 8.2 0 0 0 14 4.4l2.4-2.4"/><path d="M3.8 4.6v4.6h4.6M20.2 19.4v-4.6h-4.6"/>',
            '💾': '<path d="M19.6 20.4H4.4a1.8 1.8 0 0 1-1.8-1.8V5.4a1.8 1.8 0 0 1 1.8-1.8h11l6 6v9a1.8 1.8 0 0 1-1.8 1.8z"/><path d="M16.6 20.4v-6.8H7.4v6.8M7.4 3.6v4.6h6.4"/>',
            '🔍': '<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.4 15.4 20.4 20.4"/>',
            '✏️': '<path d="M16.4 3.9a2.1 2.1 0 0 1 3 3L8 18.3l-4 1 1-4z"/>',
            '🗑️': '<path d="M3.8 6.6h16.4M9.4 6.6V4.8a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v1.8M18.2 6.6v12.2a1.8 1.8 0 0 1-1.8 1.8H7.6a1.8 1.8 0 0 1-1.8-1.8V6.6"/>',
            '💡': '<path d="M9.2 18.4h5.6M10 21h4"/><path d="M12 3.2a6 6 0 0 0-3.6 10.8c.6.5.9 1.1 1 1.8h5.2c.1-.7.4-1.3 1-1.8A6 6 0 0 0 12 3.2z"/>',
            '🎯': '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.2"/>',
            '🔒': '<rect x="4.6" y="10.2" width="14.8" height="10" rx="2.2"/><path d="M8.2 10.2V7.6a3.8 3.8 0 0 1 7.6 0v2.6"/>',
            '⬆': '<path d="M12 20V4.6M6.4 10.2 12 4.6l5.6 5.6"/>',
            '⬇': '<path d="M12 4v15.4M6.4 13.8 12 19.4l5.6-5.6"/>',
            '✕': '<path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8"/>',
            '✖': '<path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8"/>',
            '✔': '<path d="M4.8 12.6 9.6 17.4 19.2 6.6"/>',
            '✓': '<path d="M4.8 12.6 9.6 17.4 19.2 6.6"/>',
            '➕': '<path d="M12 4.6v14.8M4.6 12h14.8"/>',
            '➖': '<path d="M4.6 12h14.8"/>',
            '🔑': '<circle cx="8.2" cy="8.2" r="4"/><path d="M11 11 20 20M17.4 17.4l2-2M14.6 14.6l2-2"/>',
            '😴': '<circle cx="12" cy="12" r="8.4"/><path d="M8.4 14.8h3.2l-3.2 3h3.2M14.2 9.4h2.6l-2.6 2.6h2.6"/>',
            '🗂': '<path d="M3.6 7.4a1.8 1.8 0 0 1 1.8-1.8h3.4l1.8 2.2h8a1.8 1.8 0 0 1 1.8 1.8v8.6a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M3.6 10.8h16.8"/>',
            '📂': '<path d="M3.6 7.4a1.8 1.8 0 0 1 1.8-1.8h3.4l1.8 2.2h8a1.8 1.8 0 0 1 1.8 1.8v8.6a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8z"/>',
            '📁': '<path d="M3.6 7.4a1.8 1.8 0 0 1 1.8-1.8h3.4l1.8 2.2h8a1.8 1.8 0 0 1 1.8 1.8v8.6a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8z"/>',
            '🔌': '<path d="M9 4.2v5M15 4.2v5"/><path d="M6.6 9.2h10.8v3a5.4 5.4 0 0 1-10.8 0z"/><path d="M12 17.6v2.6"/>',
            '⛔': '<circle cx="12" cy="12" r="8.4"/><path d="M6.6 6.6 17.4 17.4"/>',
            '🚫': '<circle cx="12" cy="12" r="8.4"/><path d="M6.6 6.6 17.4 17.4"/>',
            '🛡': '<path d="M12 3.6 4.8 6.6v5c0 4.4 3 8.2 7.2 9.4 4.2-1.2 7.2-5 7.2-9.4v-5z"/>',
            '👑': '<path d="M3.6 8.2 6.8 14 12 6.4 17.2 14l3.2-5.8v9.4a1.4 1.4 0 0 1-1.4 1.4H5a1.4 1.4 0 0 1-1.4-1.4z"/>',
            '🗺': '<path d="m3.6 7 5.4-2.2 6 2.4 5.4-2.2v12.4l-5.4 2.2-6-2.4L3.6 19.4z"/><path d="M9 4.8v12.6M15 7.2v12.4"/>',
            '✎': '<path d="M16.4 3.9a2.1 2.1 0 0 1 3 3L8 18.3l-4 1 1-4z"/>',
            '📝': '<path d="M16.4 3.9a2.1 2.1 0 0 1 3 3L8 18.3l-4 1 1-4z"/>',
            '🏷': '<path d="M11.6 3.8H5.4a1.6 1.6 0 0 0-1.6 1.6v6.2a1.8 1.8 0 0 0 .53 1.27l7.1 7.1a1.6 1.6 0 0 0 2.26 0l6.2-6.2a1.6 1.6 0 0 0 0-2.26l-7.1-7.1A1.8 1.8 0 0 0 11.6 3.8z"/><circle cx="8.2" cy="8.2" r="1.1"/>',
            '⏱': '<circle cx="12" cy="13.4" r="7.2"/><path d="M12 9.8v3.6l2.4 1.6M9.4 2.8h5.2"/>',
            '⏳': '<path d="M7 3.6h10M7 20.4h10"/><path d="M8 3.6v3.6L12 12l4-4.8V3.6M8 20.4v-3.6L12 12l4 4.8v3.6"/>',
            '📅': '<rect x="3.8" y="5.4" width="16.4" height="15" rx="2"/><path d="M3.8 10h16.4M8.4 3.6v3.6M15.6 3.6v3.6"/>',
            '🔔': '<path d="M17.4 10.4a5.4 5.4 0 0 0-10.8 0c0 5.2-2.2 6.6-2.2 6.6h15.2s-2.2-1.4-2.2-6.6z"/><path d="M13.6 20.2a1.9 1.9 0 0 1-3.2 0"/>',
            '⭐': '<path d="m12 4 2.5 5.2 5.7.8-4.1 4 1 5.6L12 17l-5.1 2.6 1-5.6-4.1-4 5.7-.8z"/>',
            '🚀': '<path d="M5.2 14.6c-1.4 1.4-1.8 5.2-1.8 5.2s3.8-.4 5.2-1.8a2.4 2.4 0 0 0-3.4-3.4z"/><path d="M11 16 8 13c.9-3.5 3-8.4 9.2-9.2.8 6.2-4.1 8.3-6.2 9.2z"/>',
            '🧊': '<path d="M20.4 8.4 12 4.2 3.6 8.4v7.2L12 19.8l8.4-4.2z"/><path d="M3.6 8.4 12 12.6l8.4-4.2M12 12.6v7.2"/>',
            '🗃': '<rect x="3.6" y="4.2" width="16.8" height="15.6" rx="2"/><path d="M3.6 9.4h16.8M3.6 14.6h16.8"/>',
            '📌': '<path d="M12 13.4v7M8 3.6h8l-1.2 6.2 2.6 2.2H6.6l2.6-2.2z"/>',
            '🔬': '<path d="M8.4 20.4h10M6.6 20.4h1.8"/><path d="M11 4.6h2.6v6.2H11z"/><path d="M12.3 10.8a5 5 0 0 1 3.4 8.6M9 19.4a5 5 0 0 1 .6-7.2"/>',
            '🧮': '<rect x="3.8" y="3.8" width="16.4" height="16.4" rx="2"/><path d="M3.8 9h16.4M9 3.8v16.4"/>',
            '🌐': '<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8"/><path d="M12 3.6a12 12 0 0 1 0 16.8 12 12 0 0 1 0-16.8z"/>',
            '📤': '<path d="M12 14.6V3.9M8 7.9 12 3.9l4 4"/><path d="M4 15.5v3.2a1.8 1.8 0 0 0 1.8 1.8h12.4a1.8 1.8 0 0 0 1.8-1.8v-3.2"/>',
            '📈': '<path d="M4 16.4 9.4 11l3.4 3.4 6.8-6.8"/><path d="M15.6 7.6h4v4"/>',
            '📉': '<path d="M4 7.6 9.4 13l3.4-3.4 6.8 6.8"/><path d="M15.6 16.4h4v-4"/>'
        };
        // Rend l'icône d'un émoji sous forme de tracé ; à défaut, garde l'émoji.
        function v7Ico(emoji, cls) {
            const d = V7_ICONS[emoji] || V7_ICONS[(emoji || '').replace('️', '')];
            if (!d) return `<span class="ic">${emoji || ''}</span>`;
            return `<svg class="v7-ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
        }

        /* --- Icônes de contenu -------------------------------------------------
           Les titres de section portaient encore des émojis. On les convertit en
           tracés APRÈS rendu, par chirurgie sur les nœuds texte uniquement : aucun
           élément n'est recréé, donc aucun écouteur d'événement n'est perturbé.
           Trois garde-fous, parce que la donnée de l'utilisateur peut elle-même
           contenir des émojis et ne doit jamais être réécrite :
             1. on n'opère que dans un contexte de TITRE (h1-h4, bouton, libellé
                en gras ou en capitales) — jamais dans une cellule de tableau ;
             2. l'émoji doit ouvrir le texte et être suivi d'une espace ;
             3. les canevas de graphes et les zones de saisie sont exclus.
           ----------------------------------------------------------------------- */
        const V7_VS16 = /\uFE0F/g;
        const V7_ICO_KEYS = Object.keys(V7_ICONS).map(k => k.replace(V7_VS16, ''));
        const V7_ESC = k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Toutes les occurrences, où qu'elles soient dans le texte — pas seulement en tête.
        const V7_ANY_RE = new RegExp('(' + V7_ICO_KEYS.map(V7_ESC).join('|') + ')\\uFE0F?', 'g');
        // Là où vit la DONNÉE de l'utilisateur : on n'y touche jamais.
        const V7_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'CODE', 'PRE', 'TD', 'TH']);
        const V7_SKIP_IDS = new Set(['advGCanvas', 'lfCanvas', 'tdgCanvas', 'v7Nav']);

        function v7Deemojify(root) {
            root = root || document.querySelector('.v7-main');
            if (!root || !root.querySelectorAll) return 0;
            let n = 0;
            const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    V7_ANY_RE.lastIndex = 0;
                    if (!V7_ANY_RE.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
                    for (let p = node.parentElement; p && p !== root; p = p.parentElement) {
                        if (V7_SKIP_TAGS.has(p.tagName) || V7_SKIP_IDS.has(p.id) || p.isContentEditable) return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            const hits = []; let x;
            while ((x = w.nextNode())) hits.push(x);
            hits.forEach(node => {
                const txt = node.nodeValue;
                const frag = document.createDocumentFragment();
                let last = 0, m; V7_ANY_RE.lastIndex = 0;
                while ((m = V7_ANY_RE.exec(txt))) {
                    const svg = v7Ico(m[1]);
                    if (!/^<svg/.test(svg)) continue;
                    if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
                    const span = document.createElement('span');
                    span.className = 'v7-cic'; span.innerHTML = svg;
                    frag.appendChild(span);
                    last = m.index + m[0].length; n++;
                }
                if (!last) return;
                if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
                node.parentNode.replaceChild(frag, node);
            });
            return n;
        }
        // Les écrans se redessinent par innerHTML : on repasse après coup, en une
        // seule fois par image, et sans se ré-observer soi-même.
        let v7DeemojiPending = false, v7DeemojiObs = null;
        function v7WatchIcons() {
            const root = document.querySelector('.v7-main'); if (!root || v7DeemojiObs) return;
            v7DeemojiObs = new MutationObserver(() => {
                if (v7DeemojiPending) return;
                v7DeemojiPending = true;
                requestAnimationFrame(() => {
                    v7DeemojiPending = false;
                    v7DeemojiObs.disconnect();
                    try { v7Deemojify(root); } catch (e) {}
                    v7DeemojiObs.observe(root, { childList: true, subtree: true });
                });
            });
            v7DeemojiObs.observe(root, { childList: true, subtree: true });
            try { v7Deemojify(root); } catch (e) {}
        }

        function renderNav() {
            const activePhase = phaseOfTab(currentTab);
            const nav = el('v7Nav');
            if (nav) {
                nav.innerHTML = NAV_PHASES.map(p => {
                    const on = p.id === activePhase.id;
                    const items = p.id === 'gov' ? govVisibleTabs(p.tabs) : p.tabs.filter(t => !t.hidden);
                    const itemsHtml = items.map(t => {
                        const isOn = on && (t.n === currentTab || (p.id === 'gov' && govState.tab === t.g));
                        const act = p.id === 'gov' ? `openGovTab('${t.g}')` : `switchTab(${t.n})`;
                        return `<button class="v7-it${isOn ? ' on' : ''}" onclick="${act}" title="${escapeHTML(t.label)}">${v7Ico(t.icon)}<span class="lbl">${escapeHTML(t.label)}</span></button>`;
                    }).join('');
                    return `<div class="v7-grp${on ? ' on open' : ''}" data-phase="${p.id}">
                        <button class="hd" onclick="v7ClickPhase('${p.id}')" title="${escapeHTML(p.label)} — ${escapeHTML(p.desc || '')}">
                            ${v7Ico(p.icon || p.tabs[0].icon)}
                            <span class="lbl">${escapeHTML(p.label)}<span class="bd">${p.badge || ''}</span></span>
                            ${items.length > 1 ? '<span class="ch">▶</span>' : ''}
                        </button>
                        ${items.length > 1 ? `<div class="v7-items">${itemsHtml}</div>` : ''}
                    </div>`;
                }).join('');
            }
            // Titre de l'écran courant
            const cur = activePhase.tabs.find(t => (activePhase.id === 'gov' ? t.g === govState.tab : t.n === currentTab))
                || (activePhase.id === 'gov' ? govVisibleTabs(activePhase.tabs)[0] : null) || activePhase.tabs[0];
            if (el('v7Title')) el('v7Title').textContent = (cur ? cur.label : activePhase.label);
            if (el('v7Sub')) el('v7Sub').textContent = activePhase.label + (activePhase.desc ? ' · ' + activePhase.desc : '');
            // Familles de la gouvernance : segments dans la barre du haut
            const fam = el('v7FamNav');
            if (fam) {
                if (activePhase.id !== 'gov') { fam.innerHTML = ''; fam.style.display = 'none'; }
                else {
                    fam.style.display = '';
                    const fams = [];
                    govVisibleTabs(activePhase.tabs).forEach(t => { if (!fams.some(f => f.name === t.fam)) fams.push({ name: t.fam, first: t.g, icon: t.icon }); });
                    const curFam = (activePhase.tabs.find(t => t.g === govState.tab) || {}).fam;
                    fam.innerHTML = fams.map(f => `<button class="${f.name === curFam ? 'on' : ''}" onclick="openGovTab('${f.first}')">${v7Ico(f.icon)}${escapeHTML(f.name)}</button>`).join('');
                }
            }
            if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }
        }
        // Cliquer une phase : on l'ouvre et on va sur son premier écran.
        function v7ClickPhase(id) {
            const p = NAV_PHASES.find(x => x.id === id); if (!p) return;
            if (p.id === phaseOfTab(currentTab).id) {
                const g = document.querySelector(`.v7-grp[data-phase="${id}"]`); if (g) g.classList.toggle('open');
                return;
            }
            switchPhase(id);
        }
        function v7ToggleCollapse() {
            const on = document.body.classList.toggle('v7-collapsed');
            if (el('v7CollapseIc')) el('v7CollapseIc').textContent = on ? '⟩' : '⟨';
            try { localStorage.setItem('sd_v7_collapsed', on ? '1' : '0'); } catch (e) {}
            setTimeout(() => { if (el('lfCanvas')) lfDrawGraph(); if (el('advGCanvas')) advDrawGraph(); }, 200);
        }
        // ---- Thème clair / sombre / automatique ----
        // Appliqué le plus tôt possible pour éviter tout clignotement clair→sombre au chargement.
        (function () {
            try {
                const pref = localStorage.getItem('sd_v7_theme') || 'auto';
                const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
                document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
                if (localStorage.getItem('sd_v7_collapsed') === '1') document.body.classList.add('v7-collapsed');
            } catch (e) {}
            if (window.matchMedia) {
                try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                    if (((() => { try { return localStorage.getItem('sd_v7_theme'); } catch (e) { return null; } })() || 'auto') === 'auto') v7ApplyTheme();
                }); } catch (e) {}
            }
        })();
        function v7ApplyTheme() {
            const pref = (() => { try { return localStorage.getItem('sd_v7_theme') || 'auto'; } catch (e) { return 'auto'; } })();
            const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
            document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
            ['light', 'dark', 'auto'].forEach(k => { const b = el('v7Th' + k[0].toUpperCase() + k.slice(1)); if (b) b.classList.toggle('on', pref === k); });
            // Le bouton Assistant de l'en-tête : couleur posée en inline (l'audit a montré que les
            // règles sombres le perdaient par intermittence dans la cascade — l'inline est imbattable).
            const wb = el('wizTopBtn');
            if (wb) { wb.style.setProperty('color', dark ? '#c7d2fe' : '#4338ca', 'important');
                      wb.style.setProperty('border-color', dark ? '#3b4a6b' : '#a5b4fc', 'important'); }
        }
        function v7SetTheme(v) {
            try { localStorage.setItem('sd_v7_theme', v); } catch (e) {}
            v7ApplyTheme();
            // les graphes dessinent des couleurs en dur : on les redessine après bascule
            setTimeout(() => { if (el('lfCanvas')) lfDrawGraph(); if (el('advGCanvas')) advDrawGraph(); if (el('tdgCanvas')) tdDrawGraph(); }, 30);
        }
