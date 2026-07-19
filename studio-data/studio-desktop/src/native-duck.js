// ============================================================================
//  PONT NATIF — remplace DuckDB-Wasm par le DuckDB natif du backend Tauri.
//
//  L'application web attend `window.__duckdbPromise` résolu en { db, conn }, où
//  `conn.query(sql)` renvoie un résultat « Arrow-like » :
//     { schema: { fields: [{name}] }, [Symbol.iterator](), toArray() }
//  et où chaque ligne est un objet { colonne: valeur }.
//
//  Ici, `conn.query` appelle la commande Rust `db_query` (DuckDB natif) et
//  reconstruit cette forme. Résultat : TOUT le code de l'appli fonctionne sans
//  modification, mais sur un moteur sans limite mémoire navigateur.
//
//  Chargé AVANT le corps de StudioData.html (dont on retire le <script type=module>
//  d'init DuckDB-Wasm). Phase 1 : db_query / db_exec branchés. Les fonctions
//  registerFileHandle / copyFileToBuffer / send seront ajoutées phases 2-3.
// ============================================================================
(function () {
  const invoke =
    (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) ||
    (window.__TAURI__ && window.__TAURI__.invoke);

  if (!invoke) {
    // Pas dans Tauri (ouvert dans un navigateur classique) : on laisse l'appli
    // utiliser son init DuckDB-Wasm d'origine.
    console.info('[native-duck] Hors Tauri — DuckDB-Wasm reste actif.');
    return;
  }

  // Emballe une réponse { columns, rows:[[...]] } en objet « Arrow-like ».
  function wrap(res) {
    const cols = res.columns || [];
    const rows = (res.rows || []).map((arr) => {
      const o = {};
      cols.forEach((c, i) => (o[c] = arr[i]));
      return o;
    });
    return {
      schema: { fields: cols.map((name) => ({ name })) },
      numRows: rows.length,
      toArray: () => rows,
      [Symbol.iterator]: function* () {
        for (const r of rows) yield r;
      },
    };
  }

  const conn = {
    // L'appli appelle conn.query pour TOUT (SELECT, CREATE, SET…). On route selon la nature.
    query: async (sql) => {
      const head = String(sql).trimStart().slice(0, 12).toUpperCase();
      const isSelect = head.startsWith('SELECT') || head.startsWith('WITH') || head.startsWith('PRAGMA') || head.startsWith('DESCRIBE');
      if (isSelect) {
        const res = await invoke('db_query', { sql });
        return wrap(res);
      }
      await invoke('db_exec', { sql });
      return wrap({ columns: [], rows: [] });
    },
    // Phase 3 : curseur en flux. Pour l'instant, repli sur query().
    send: undefined,
    close: async () => {},
  };

  // `db` : quelques méthodes que l'appli appelle. En phase 1, on neutralise
  // proprement celles liées aux fichiers virtuels (elles seront remplacées par
  // des chemins disque natifs en phase 2).
  const db = {
    registerFileHandle: async () => {
      throw new Error('Chargement de fichier natif : à implémenter (phase 2, via chemin disque).');
    },
    registerFileBuffer: async () => {},
    registerFileText: async () => {},
    copyFileToBuffer: async () => {
      throw new Error('Export natif : à implémenter (phase 3, via db_export_parquet).');
    },
    dropFile: async () => {},
  };

  window.__duckdbNative = true;
  window.__duckdbPromise = Promise.resolve({ db, conn });
  console.info('[native-duck] DuckDB natif branché via Tauri ✔');
})();
