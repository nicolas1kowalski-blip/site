        // ======================= NOYAU : ÉTAT GLOBAL DE L'APPLICATION =======================
        // Tout ce que l'application sait vit ici, dans « state » (sources chargées, liens du modèle, gouvernance,
        // paramétrage de l'extraction…) et dans quelques variables d'écran (navigateur, comparateur, profilage, carte des
        // flux). Les structures sont décrites dans 01-types.js ; la persistance est dans 13-noyau-persistance-locale.js.
        // Une variable déclarée ici avec « let » peut être réassignée depuis d'autres fichiers (un seul <script>).
        const state = {
            tables: {},
            relations: [],
            selectedCols: {},
            pivotMode: {},
            filters: {},
            hierarchyConfig: {},
            graphConfig: {}
        };
        state.advExtract = {
            from: 'table',
            objectId: '',
            baseId: '',
            columns: [],
            filters: [],
            dedup: { on: false, keys: [], keep: 'first' },
            group: { on: false, aggs: [] },
            customSql: false,
            joinType: 'left',
            limit500: false,
            migrated: false
        };
        let networkInstance = null;
        let currentChart = null;
        let browserState = { tableId: null, filters: {}, sortCol: null, sortDir: 'asc', data: [], linkMap: {} };
        let browserFilterTimeout = null;
        let expNetInstance = null;
        let expDataStore = {};
        let compState = { mappings: [], keys: [] };
        let currentProfilingStats = null;
        let currentProfilingTableId = null;
        let currentProfilingGroupCol = '';
        let currentProfilingWhere = '';
        let qualAuditWhereOverride = null;
        // Référentiel de gouvernance : indexé par NOM de table (et non id technique) pour survivre
        // aux rechargements et aux échanges de bundles entre collègues.
        state.governance = {
            perimeters: [],
            dictionary: {},
            glossary: [],
            useCases: [],
            businessObjects: [],
            rules: [],
            lineage: {},
            qualityHistory: [],
            assets: [],
            srcWatch: {},
            flow: { nodes: [], edges: [], threshold: 1.0 },
            flowLog: []
        };
        let govState = { tab: 'catalog', dictTable: null, resetArmed: false, selectedBoId: null, showMulti: false }; // V6.12 : on entre par « Découvrir » (Catalogue)
        let lineageGraph = null;

        const el = id => document.getElementById(id);
        const generateId = () => Math.random().toString(36).substr(2, 9);
        const escapeHTML = str =>
            !str && str !== 0
                ? ''
                : String(str).replace(
                      /[&<>'"]/g,
                      t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[t] || t
                  );
        const escapeCSV = val => (val !== null && val !== undefined ? '"' + String(val).replace(/"/g, '""') + '"' : '');
        const cleanFileName = n =>
            n
                .toLowerCase()
                .replace(/\.(csv|xlsx|xls|txt)$/, '')
                .trim();
        const cleanHeader = h =>
            h
                ? String(h)
                      .replace(/^\uFEFF/, '')
                      .trim()
                : 'Unamed_Col';
        // Formats de source acceptés — une seule liste, partagée par le sélecteur de fichiers,
        // le glisser-déposer, l'import de dossier et le message d'erreur.
        const SRC_EXTS = ['csv', 'txt', 'xlsx', 'xls', 'json'];
        const isNumVal = v => /^\s*-?\d+([.,]\d+)?\s*$/.test(v);
        const isDateVal = v => {
            if (!v || v.length < 8) return false;
            return /^\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(v) || /^\s*\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(v);
        };
        const parseFlexibleDate = v => {
            if (!v) return null;
            let date = new Date(String(v).trim());
            if (isNaN(date.getTime())) {
                const text = String(v)
                    .trim()
                    .split(/[\/\- ]/);
                if (text.length >= 3 && text[2].length === 4) date = new Date(`${text[2]}-${text[1]}-${text[0]}`);
            }
            return isNaN(date.getTime()) ? null : date.getTime();
        };
        const hashCode = str => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = (hash << 5) - hash + str.charCodeAt(i);
                hash = hash & hash;
            }
            return Math.abs(hash).toString(36);
        };

        // Builds a list of <option> tags for the loaded tables (used across every tab's table selectors).
        function tableOptionsHtml({ placeholder = '', readyOnly = false } = {}) {
            const list = Object.values(state.tables).filter(t => !readyOnly || t.status === 'ready');
            const head = placeholder ? `<option value="">${escapeHTML(placeholder)}</option>` : '';
            return head + list.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('');
        }
